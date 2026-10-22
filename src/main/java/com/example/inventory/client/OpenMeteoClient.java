package com.example.inventory.client;

import com.example.inventory.dto.WarehouseForecastReportDto;
import com.example.inventory.dto.WeatherAdvisoryDto;
import com.example.inventory.dto.WeatherInfoDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Component
public class OpenMeteoClient {

    private static final Logger log = LoggerFactory.getLogger(OpenMeteoClient.class);

    private final RestTemplate restTemplate;
    private final String openMeteoApiUrl;
    private final String warehouseLocationName;
    private final double warehouseLatitude;
    private final double warehouseLongitude;
    private final int cacheDurationMinutes;

    // In-memory cache for forecast report
    private WarehouseForecastReportDto cachedForecastReport;
    private long cacheTimestampMillis = 0;

    @Autowired
    public OpenMeteoClient(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${openmeteo.api.url:https://api.open-meteo.com/v1/forecast}") String openMeteoApiUrl,
            @Value("${warehouse.location.name:Mumbai Central Distribution Hub}") String warehouseLocationName,
            @Value("${warehouse.location.latitude:19.0760}") double warehouseLatitude,
            @Value("${warehouse.location.longitude:72.8777}") double warehouseLongitude,
            @Value("${openmeteo.cache.duration.minutes:15}") int cacheDurationMinutes) {
        this.restTemplate = restTemplateBuilder
                .connectTimeout(Duration.ofSeconds(4))
                .readTimeout(Duration.ofSeconds(4))
                .build();
        this.openMeteoApiUrl = openMeteoApiUrl;
        this.warehouseLocationName = warehouseLocationName;
        this.warehouseLatitude = warehouseLatitude;
        this.warehouseLongitude = warehouseLongitude;
        this.cacheDurationMinutes = cacheDurationMinutes;
    }

    public OpenMeteoClient(
            RestTemplateBuilder restTemplateBuilder,
            String openMeteoApiUrl,
            String warehouseLocationName,
            double warehouseLatitude,
            double warehouseLongitude) {
        this(restTemplateBuilder, openMeteoApiUrl, warehouseLocationName, warehouseLatitude, warehouseLongitude, 15);
    }

    public WeatherInfoDto getWarehouseWeather() {
        return getWeather(warehouseLocationName, warehouseLatitude, warehouseLongitude);
    }

    public WeatherInfoDto getWeather(String locationName, double latitude, double longitude) {
        String url = String.format("%s?latitude=%.4f&longitude=%.4f&current_weather=true", openMeteoApiUrl, latitude, longitude);
        try {
            OpenMeteoResponse response = restTemplate.getForObject(url, OpenMeteoResponse.class);

            if (response != null && response.getCurrent_weather() != null) {
                CurrentWeather weather = response.getCurrent_weather();
                String condition = decodeWeatherCode(weather.getWeathercode());

                return new WeatherInfoDto(
                        locationName,
                        weather.getTemperature(),
                        weather.getWindspeed(),
                        condition,
                        "SUCCESS: Live data from Open-Meteo API"
                );
            }
        } catch (RestClientException ex) {
            log.warn("Open-Meteo API call failed at {}: {}", url, ex.getMessage());
        } catch (Exception ex) {
            log.error("Unexpected error during Open-Meteo API weather query: {}", ex.getMessage());
        }

        // Resilient fallback when API is down or unreachable
        return new WeatherInfoDto(
                locationName,
                0.0,
                0.0,
                "Unknown / Unavailable",
                "UNAVAILABLE: Unable to connect to Open-Meteo API at " + openMeteoApiUrl
        );
    }

    // --------------------------------------------------------------------------
    // Milestone 4: Weather Forecast & Advisory Engine
    // --------------------------------------------------------------------------

    public synchronized void clearCache() {
        this.cachedForecastReport = null;
        this.cacheTimestampMillis = 0;
    }

    public synchronized WarehouseForecastReportDto getWarehouseForecastAndAdvisories(Integer maxHorizonHours, boolean forceRefresh) {
        int horizon = (maxHorizonHours != null && maxHorizonHours > 0) ? Math.min(maxHorizonHours, 48) : 48;
        long now = System.currentTimeMillis();
        long cacheTtl = (long) cacheDurationMinutes * 60 * 1000;

        if (!forceRefresh && cachedForecastReport != null && (now - cacheTimestampMillis < cacheTtl)) {
            log.info("Returning cached Open-Meteo forecast report (age: {}s)", (now - cacheTimestampMillis) / 1000);
            return cachedForecastReport;
        }

        String url = String.format(
                "%s?latitude=%.4f&longitude=%.4f&current_weather=true&hourly=precipitation_probability,precipitation,wind_speed_10m,weather_code&forecast_days=2",
                openMeteoApiUrl, warehouseLatitude, warehouseLongitude
        );

        try {
            OpenMeteoResponse response = restTemplate.getForObject(url, OpenMeteoResponse.class);
            if (response != null) {
                WarehouseForecastReportDto report = evaluateAdvisories(response, horizon);
                this.cachedForecastReport = report;
                this.cacheTimestampMillis = now;
                return report;
            }
        } catch (RestClientException ex) {
            log.warn("Open-Meteo forecast API call failed at {}: {}", url, ex.getMessage());
        } catch (Exception ex) {
            log.error("Unexpected error during Open-Meteo forecast query: {}", ex.getMessage());
        }

        // Resilient fallback if API fails
        List<WeatherAdvisoryDto> fallbackAdvisories = new ArrayList<>();
        fallbackAdvisories.add(new WeatherAdvisoryDto(
                "ADV-CONN-FAIL",
                "WARNING",
                "Weather Forecast Service Temporarily Unavailable",
                "Unable to retrieve live forecast from Open-Meteo API. Operational weather risk cannot currently be refreshed.",
                "Next " + horizon + " Hours",
                "Network / API service error (" + openMeteoApiUrl + ")",
                "Maintain standard safe warehouse procedures until live meteorological service connectivity is restored.",
                "Forecast-based operational advisory; not a confirmation of actual road closure or transport disruption."
        ));

        return new WarehouseForecastReportDto(
                warehouseLocationName,
                warehouseLatitude,
                warehouseLongitude,
                LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                horizon,
                0.0,
                0.0,
                "Unknown / Unavailable",
                "UNAVAILABLE: Live forecast unavailable from Open-Meteo API",
                fallbackAdvisories
        );
    }

    public WarehouseForecastReportDto evaluateAdvisories(OpenMeteoResponse response, int horizon) {
        double temp = 0.0;
        double wind = 0.0;
        String condition = "Normal";

        if (response.getCurrent_weather() != null) {
            temp = response.getCurrent_weather().getTemperature();
            wind = response.getCurrent_weather().getWindspeed();
            condition = decodeWeatherCode(response.getCurrent_weather().getWeathercode());
        }

        List<WeatherAdvisoryDto> advisories = new ArrayList<>();
        HourlyWeather hourly = response.getHourly();

        int maxPrecipProb = 0;
        double maxPrecipMm = 0.0;
        String peakPrecipTime = "Forecast Window";

        double maxWindSpeed = 0.0;
        String peakWindTime = "Forecast Window";

        boolean hasSevereCode = false;
        int severeCode = 0;
        String severeTime = "Forecast Window";

        if (hourly != null && hourly.getTime() != null) {
            int limit = Math.min(horizon, hourly.getTime().size());

            for (int i = 0; i < limit; i++) {
                String t = hourly.getTime().get(i);

                if (hourly.getPrecipitation_probability() != null && i < hourly.getPrecipitation_probability().size()) {
                    Integer prob = hourly.getPrecipitation_probability().get(i);
                    if (prob != null && prob > maxPrecipProb) {
                        maxPrecipProb = prob;
                    }
                }

                if (hourly.getPrecipitation() != null && i < hourly.getPrecipitation().size()) {
                    Double precip = hourly.getPrecipitation().get(i);
                    if (precip != null && precip > maxPrecipMm) {
                        maxPrecipMm = precip;
                        peakPrecipTime = t;
                    }
                }

                if (hourly.getWind_speed_10m() != null && i < hourly.getWind_speed_10m().size()) {
                    Double w = hourly.getWind_speed_10m().get(i);
                    if (w != null && w > maxWindSpeed) {
                        maxWindSpeed = w;
                        peakWindTime = t;
                    }
                }

                if (hourly.getWeather_code() != null && i < hourly.getWeather_code().size()) {
                    Integer code = hourly.getWeather_code().get(i);
                    if (code != null && isSevereWeatherCode(code) && !hasSevereCode) {
                        hasSevereCode = true;
                        severeCode = code;
                        severeTime = t;
                    }
                }
            }
        }

        // Rule 1: Heavy Precipitation Risk (probability >= 70% and precipitation >= 5.0 mm)
        if (maxPrecipProb >= 70 && maxPrecipMm >= 5.0) {
            String severity = maxPrecipMm >= 15.0 ? "HIGH" : "WARNING";
            advisories.add(new WeatherAdvisoryDto(
                    "ADV-PRECIP-HEAVY",
                    severity,
                    "Heavy Precipitation & Yard Inundation Risk",
                    String.format("[General Warehouse Consideration] Forecast indicates high probability of heavy rain (%d%% probability, peak %.1f mm/hr) expected around %s.", maxPrecipProb, maxPrecipMm, peakPrecipTime),
                    peakPrecipTime,
                    String.format("Precipitation Probability = %d%% (threshold >= 70%%), Peak Rain = %.1f mm/hr (threshold >= 5.0 mm)", maxPrecipProb, maxPrecipMm),
                    "Ensure covered loading bays, inspect warehouse storm drainage, and verify protective moisture-proof stretch wrapping for vulnerable cartons.",
                    "Forecast-based operational advisory; not a confirmation of actual road closure or transport disruption."
            ));
        }

        // Rule 2: High Wind Hazard (wind speed >= 35.0 km/h)
        if (maxWindSpeed >= 35.0) {
            String severity = maxWindSpeed >= 50.0 ? "HIGH" : "WARNING";
            advisories.add(new WeatherAdvisoryDto(
                    "ADV-WIND-HIGH",
                    severity,
                    "High Wind Hazard at Loading Bays",
                    String.format("[General Warehouse Consideration] Forecast wind speeds reach up to %.1f km/h around %s, posing instability risks to high-stack reach trucks and external staging.", maxWindSpeed, peakWindTime),
                    peakWindTime,
                    String.format("Peak Wind Speed = %.1f km/h (operational threshold >= 35.0 km/h)", maxWindSpeed),
                    "Secure external yard tarpaulins, restrict high-elevation forklift operations in outdoor bays, and keep exterior bay roller doors closed.",
                    "Forecast-based operational advisory; not a confirmation of actual road closure or transport disruption."
            ));
        }

        // Rule 3: Severe Weather Conditions (Thunderstorm, Hail, Severe Rain/Snow)
        if (hasSevereCode) {
            String severeDesc = decodeWeatherCode(severeCode);
            advisories.add(new WeatherAdvisoryDto(
                    "ADV-SEVERE-STORM",
                    "HIGH",
                    "Severe Thunderstorm & Lightning Alert",
                    String.format("[General Warehouse Consideration] Meteorological model detects severe atmospheric turbulence (%s, code %d) expected around %s.", severeDesc, severeCode, severeTime),
                    severeTime,
                    String.format("Weather Code = %d (%s indicates thunderstorm / violent precipitation)", severeCode, severeDesc),
                    "Alert logistics team, pause exposed yard and gantry operations during storm cell passage, and verify emergency backup generator readiness.",
                    "Forecast-based operational advisory; not a confirmation of actual road closure or transport disruption."
            ));
        }

        // Rule 4: Normal Operating Conditions (when no adverse rules trigger)
        if (advisories.isEmpty()) {
            advisories.add(new WeatherAdvisoryDto(
                    "ADV-NORMAL-COND",
                    "INFO",
                    "Normal Operating Conditions",
                    String.format("[General Warehouse Consideration] Meteorological forecast indicates standard conditions (peak rain: %.1f mm, peak wind: %.1f km/h) over the next %d hours.", maxPrecipMm, maxWindSpeed, horizon),
                    "Next " + horizon + " Hours",
                    "All forecast meteorological metrics remain within normal operational safety thresholds.",
                    "Standard warehousing, receiving, and dispatch schedules apply.",
                    "Forecast-based operational advisory; not a confirmation of actual road closure or transport disruption."
            ));
        }

        // Sort advisories by severity: HIGH -> WARNING -> INFO
        advisories.sort((a, b) -> Integer.compare(severityRank(b.getSeverity()), severityRank(a.getSeverity())));

        String retrievalTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        return new WarehouseForecastReportDto(
                warehouseLocationName,
                warehouseLatitude,
                warehouseLongitude,
                retrievalTime,
                horizon,
                temp,
                wind,
                condition,
                "SUCCESS: Live forecast from Open-Meteo API",
                advisories
        );
    }

    private boolean isSevereWeatherCode(int code) {
        return code == 95 || code == 96 || code == 99 || code == 65 || code == 75 || code == 82;
    }

    private int severityRank(String severity) {
        if ("HIGH".equalsIgnoreCase(severity)) return 3;
        if ("WARNING".equalsIgnoreCase(severity)) return 2;
        if ("INFO".equalsIgnoreCase(severity)) return 1;
        return 0;
    }

    public String decodeWeatherCode(int code) {
        return switch (code) {
            case 0 -> "Clear Sky";
            case 1 -> "Mainly Clear";
            case 2 -> "Partly Cloudy";
            case 3 -> "Overcast";
            case 45, 48 -> "Foggy / Depositing Rime Fog";
            case 51, 53, 55 -> "Drizzle (Light to Dense)";
            case 61, 63, 65 -> "Rain (Slight to Heavy)";
            case 71, 73, 75 -> "Snow Fall";
            case 77 -> "Snow Grains";
            case 80, 81, 82 -> "Rain Showers";
            case 85, 86 -> "Snow Showers";
            case 95 -> "Thunderstorm";
            case 96, 99 -> "Thunderstorm with Hail";
            default -> "Fair / Moderate (" + code + ")";
        };
    }

    // Inner DTOs matching Open-Meteo JSON response
    public static class OpenMeteoResponse {
        private double latitude;
        private double longitude;
        private CurrentWeather current_weather;
        private HourlyWeather hourly;

        public OpenMeteoResponse() {
        }

        public double getLatitude() {
            return latitude;
        }

        public void setLatitude(double latitude) {
            this.latitude = latitude;
        }

        public double getLongitude() {
            return longitude;
        }

        public void setLongitude(double longitude) {
            this.longitude = longitude;
        }

        public CurrentWeather getCurrent_weather() {
            return current_weather;
        }

        public void setCurrent_weather(CurrentWeather current_weather) {
            this.current_weather = current_weather;
        }

        public HourlyWeather getHourly() {
            return hourly;
        }

        public void setHourly(HourlyWeather hourly) {
            this.hourly = hourly;
        }
    }

    public static class HourlyWeather {
        private List<String> time;
        private List<Integer> precipitation_probability;
        private List<Double> precipitation;
        private List<Double> wind_speed_10m;
        private List<Integer> weather_code;

        public HourlyWeather() {
        }

        public List<String> getTime() {
            return time;
        }

        public void setTime(List<String> time) {
            this.time = time;
        }

        public List<Integer> getPrecipitation_probability() {
            return precipitation_probability;
        }

        public void setPrecipitation_probability(List<Integer> precipitation_probability) {
            this.precipitation_probability = precipitation_probability;
        }

        public List<Double> getPrecipitation() {
            return precipitation;
        }

        public void setPrecipitation(List<Double> precipitation) {
            this.precipitation = precipitation;
        }

        public List<Double> getWind_speed_10m() {
            return wind_speed_10m;
        }

        public void setWind_speed_10m(List<Double> wind_speed_10m) {
            this.wind_speed_10m = wind_speed_10m;
        }

        public List<Integer> getWeather_code() {
            return weather_code;
        }

        public void setWeather_code(List<Integer> weather_code) {
            this.weather_code = weather_code;
        }
    }

    public static class CurrentWeather {
        private double temperature;
        private double windspeed;
        private double winddirection;
        private int weathercode;
        private String time;

        public CurrentWeather() {
        }

        public double getTemperature() {
            return temperature;
        }

        public void setTemperature(double temperature) {
            this.temperature = temperature;
        }

        public double getWindspeed() {
            return windspeed;
        }

        public void setWindspeed(double windspeed) {
            this.windspeed = windspeed;
        }

        public double getWinddirection() {
            return winddirection;
        }

        public void setWinddirection(double winddirection) {
            this.winddirection = winddirection;
        }

        public int getWeathercode() {
            return weathercode;
        }

        public void setWeathercode(int weathercode) {
            this.weathercode = weathercode;
        }

        public String getTime() {
            return time;
        }

        public void setTime(String time) {
            this.time = time;
        }
    }
}
