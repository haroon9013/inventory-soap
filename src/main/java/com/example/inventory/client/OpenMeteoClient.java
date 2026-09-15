package com.example.inventory.client;

import com.example.inventory.dto.WeatherInfoDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Component
public class OpenMeteoClient {

    private static final Logger log = LoggerFactory.getLogger(OpenMeteoClient.class);

    private final RestTemplate restTemplate;
    private final String openMeteoApiUrl;
    private final String warehouseLocationName;
    private final double warehouseLatitude;
    private final double warehouseLongitude;

    public OpenMeteoClient(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${openmeteo.api.url:https://api.open-meteo.com/v1/forecast}") String openMeteoApiUrl,
            @Value("${warehouse.location.name:Mumbai Central Distribution Hub}") String warehouseLocationName,
            @Value("${warehouse.location.latitude:19.0760}") double warehouseLatitude,
            @Value("${warehouse.location.longitude:72.8777}") double warehouseLongitude) {
        this.restTemplate = restTemplateBuilder
                .connectTimeout(Duration.ofSeconds(4))
                .readTimeout(Duration.ofSeconds(4))
                .build();
        this.openMeteoApiUrl = openMeteoApiUrl;
        this.warehouseLocationName = warehouseLocationName;
        this.warehouseLatitude = warehouseLatitude;
        this.warehouseLongitude = warehouseLongitude;
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

    private String decodeWeatherCode(int code) {
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
