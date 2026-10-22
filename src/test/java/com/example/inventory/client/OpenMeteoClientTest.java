package com.example.inventory.client;

import com.example.inventory.dto.WarehouseForecastReportDto;
import com.example.inventory.dto.WeatherAdvisoryDto;
import com.example.inventory.dto.WeatherInfoDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OpenMeteoClientTest {

    private RestTemplate restTemplate;
    private RestTemplateBuilder restTemplateBuilder;
    private OpenMeteoClient openMeteoClient;

    @BeforeEach
    void setUp() {
        restTemplate = mock(RestTemplate.class);
        restTemplateBuilder = mock(RestTemplateBuilder.class);
        when(restTemplateBuilder.connectTimeout(any(Duration.class))).thenReturn(restTemplateBuilder);
        when(restTemplateBuilder.readTimeout(any(Duration.class))).thenReturn(restTemplateBuilder);
        when(restTemplateBuilder.build()).thenReturn(restTemplate);

        openMeteoClient = new OpenMeteoClient(
                restTemplateBuilder,
                "https://api.open-meteo.com/v1/forecast",
                "Mumbai Central Distribution Hub",
                19.0760,
                72.8777,
                15
        );
    }

    private OpenMeteoClient.OpenMeteoResponse createMockForecastResponse(
            double temp, double currentWind, int currentCode,
            List<String> times,
            List<Integer> precipProb,
            List<Double> precip,
            List<Double> windSpeed,
            List<Integer> weatherCodes
    ) {
        OpenMeteoClient.OpenMeteoResponse response = new OpenMeteoClient.OpenMeteoResponse();
        response.setLatitude(19.0760);
        response.setLongitude(72.8777);

        OpenMeteoClient.CurrentWeather cw = new OpenMeteoClient.CurrentWeather();
        cw.setTemperature(temp);
        cw.setWindspeed(currentWind);
        cw.setWeathercode(currentCode);
        cw.setTime("2026-10-22T12:00");
        response.setCurrent_weather(cw);

        OpenMeteoClient.HourlyWeather hw = new OpenMeteoClient.HourlyWeather();
        hw.setTime(times);
        hw.setPrecipitation_probability(precipProb);
        hw.setPrecipitation(precip);
        hw.setWind_speed_10m(windSpeed);
        hw.setWeather_code(weatherCodes);
        response.setHourly(hw);

        return response;
    }

    @Test
    void testGetWarehouseWeatherSuccess() {
        OpenMeteoClient.OpenMeteoResponse mockResponse = new OpenMeteoClient.OpenMeteoResponse();
        mockResponse.setLatitude(19.076);
        mockResponse.setLongitude(72.8777);

        OpenMeteoClient.CurrentWeather weather = new OpenMeteoClient.CurrentWeather();
        weather.setTemperature(26.8);
        weather.setWindspeed(5.2);
        weather.setWeathercode(0); // Clear sky
        weather.setTime("2026-09-14T00:00");
        mockResponse.setCurrent_weather(weather);

        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        WeatherInfoDto result = openMeteoClient.getWarehouseWeather();

        assertNotNull(result);
        assertEquals("Mumbai Central Distribution Hub", result.getLocation());
        assertEquals(26.8, result.getTemperature());
        assertEquals(5.2, result.getWindSpeed());
        assertEquals("Clear Sky", result.getWeatherCondition());
        assertTrue(result.getStatus().contains("SUCCESS"));
    }

    @Test
    void testGetWarehouseWeatherApiFailureFallback() {
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenThrow(new RestClientException("503 Service Unavailable"));

        WeatherInfoDto result = openMeteoClient.getWarehouseWeather();

        assertNotNull(result);
        assertEquals("Mumbai Central Distribution Hub", result.getLocation());
        assertEquals(0.0, result.getTemperature());
        assertEquals(0.0, result.getWindSpeed());
        assertTrue(result.getStatus().contains("UNAVAILABLE"));
    }

    @Test
    void testMappingValidForecastData() {
        List<String> times = Arrays.asList("2026-10-22T12:00", "2026-10-22T13:00");
        List<Integer> probs = Arrays.asList(25, 30);
        List<Double> precips = Arrays.asList(0.2, 0.4);
        List<Double> winds = Arrays.asList(15.0, 18.0);
        List<Integer> codes = Arrays.asList(1, 2);

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(28.5, 14.0, 1, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);

        assertNotNull(report);
        assertEquals("Mumbai Central Distribution Hub", report.getLocation());
        assertEquals(19.0760, report.getLatitude(), 0.001);
        assertEquals(72.8777, report.getLongitude(), 0.001);
        assertEquals(28.5, report.getCurrentTemperature());
        assertEquals(14.0, report.getCurrentWindSpeed());
        assertEquals("Mainly Clear", report.getCurrentCondition());
        assertTrue(report.getStatus().contains("SUCCESS"));
        assertEquals(48, report.getForecastHorizonHours());
        assertNotNull(report.getRetrievalTime());
        assertNotNull(report.getAdvisories());
    }

    @Test
    void testForecastWithNoAdverseConditionsGeneratesNormalAdvisory() {
        List<String> times = Arrays.asList("2026-10-22T12:00", "2026-10-22T13:00");
        List<Integer> probs = Arrays.asList(20, 30);
        List<Double> precips = Arrays.asList(0.0, 1.5);
        List<Double> winds = Arrays.asList(10.0, 14.0);
        List<Integer> codes = Arrays.asList(0, 1);

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(27.0, 12.0, 0, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);

        assertNotNull(report.getAdvisories());
        assertEquals(1, report.getAdvisories().size());
        WeatherAdvisoryDto advisory = report.getAdvisories().get(0);
        assertEquals("ADV-NORMAL-COND", advisory.getId());
        assertEquals("INFO", advisory.getSeverity());
        assertEquals("Normal Operating Conditions", advisory.getTitle());
        assertTrue(advisory.getRecommendedAction().contains("Standard warehousing"));
        assertTrue(advisory.getDisclaimer().contains("Forecast-based operational advisory"));
    }

    @Test
    void testHeavyPrecipitationAdvisoryWarning() {
        List<String> times = Arrays.asList("2026-10-22T12:00", "2026-10-22T13:00");
        List<Integer> probs = Arrays.asList(50, 75); // >= 70%
        List<Double> precips = Arrays.asList(2.0, 8.5); // >= 5.0 mm and < 15.0 mm -> WARNING
        List<Double> winds = Arrays.asList(12.0, 15.0);
        List<Integer> codes = Arrays.asList(61, 61);

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(25.0, 12.0, 61, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);

        assertEquals(1, report.getAdvisories().size());
        WeatherAdvisoryDto adv = report.getAdvisories().get(0);
        assertEquals("ADV-PRECIP-HEAVY", adv.getId());
        assertEquals("WARNING", adv.getSeverity());
        assertTrue(adv.getTitle().contains("Heavy Precipitation"));
        assertTrue(adv.getTriggerConditions().contains("75%"));
        assertTrue(adv.getTriggerConditions().contains("8.5 mm/hr"));
        assertEquals("2026-10-22T13:00", adv.getExpectedTime());
        assertTrue(adv.getRecommendedAction().contains("covered loading bays"));
    }

    @Test
    void testHeavyPrecipitationAdvisoryHigh() {
        List<String> times = Arrays.asList("2026-10-22T12:00", "2026-10-22T13:00");
        List<Integer> probs = Arrays.asList(80, 90); // >= 70%
        List<Double> precips = Arrays.asList(10.0, 18.0); // >= 15.0 mm -> HIGH
        List<Double> winds = Arrays.asList(15.0, 20.0);
        List<Integer> codes = Arrays.asList(61, 63);

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(24.0, 15.0, 63, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);

        assertEquals(1, report.getAdvisories().size());
        WeatherAdvisoryDto adv = report.getAdvisories().get(0);
        assertEquals("ADV-PRECIP-HEAVY", adv.getId());
        assertEquals("HIGH", adv.getSeverity());
        assertTrue(adv.getTriggerConditions().contains("90%"));
        assertTrue(adv.getTriggerConditions().contains("18.0 mm/hr"));
    }

    @Test
    void testHighWindAdvisoryWarningAndHigh() {
        // Warning: wind >= 35.0 and < 50.0
        List<String> times = Arrays.asList("2026-10-22T12:00", "2026-10-22T13:00");
        List<Integer> probs = Arrays.asList(10, 20);
        List<Double> precips = Arrays.asList(0.0, 0.0);
        List<Double> winds = Arrays.asList(25.0, 42.0); // 42.0 km/h -> WARNING
        List<Integer> codes = Arrays.asList(1, 1);

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(28.0, 25.0, 1, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);

        assertEquals(1, report.getAdvisories().size());
        WeatherAdvisoryDto adv = report.getAdvisories().get(0);
        assertEquals("ADV-WIND-HIGH", adv.getId());
        assertEquals("WARNING", adv.getSeverity());
        assertTrue(adv.getTriggerConditions().contains("42.0 km/h"));
        assertTrue(adv.getRecommendedAction().contains("forklift"));

        // High: wind >= 50.0
        winds = Arrays.asList(30.0, 56.5);
        mockResponse = createMockForecastResponse(28.0, 30.0, 1, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);
        assertEquals("HIGH", report.getAdvisories().get(0).getSeverity());
        assertTrue(report.getAdvisories().get(0).getTriggerConditions().contains("56.5 km/h"));
    }

    @Test
    void testThunderstormSevereConditionAdvisory() {
        List<String> times = Arrays.asList("2026-10-22T14:00");
        List<Integer> probs = Arrays.asList(40);
        List<Double> precips = Arrays.asList(2.0);
        List<Double> winds = Arrays.asList(20.0);
        List<Integer> codes = Arrays.asList(95); // Thunderstorm

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(26.0, 20.0, 95, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);

        assertEquals(1, report.getAdvisories().size());
        WeatherAdvisoryDto adv = report.getAdvisories().get(0);
        assertEquals("ADV-SEVERE-STORM", adv.getId());
        assertEquals("HIGH", adv.getSeverity());
        assertTrue(adv.getTitle().contains("Thunderstorm"));
        assertTrue(adv.getTriggerConditions().contains("95"));
        assertTrue(adv.getRecommendedAction().contains("yard and gantry"));
    }

    @Test
    void testCorrectSeverityOrdering() {
        // Triggers Rain (WARNING), Wind (HIGH), Storm (HIGH)
        List<String> times = Arrays.asList("2026-10-22T12:00", "2026-10-22T13:00");
        List<Integer> probs = Arrays.asList(75, 80);
        List<Double> precips = Arrays.asList(6.0, 7.0); // WARNING
        List<Double> winds = Arrays.asList(52.0, 55.0); // HIGH
        List<Integer> codes = Arrays.asList(95, 95);    // HIGH

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(24.0, 52.0, 95, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);

        assertEquals(3, report.getAdvisories().size());
        // HIGH advisories must come first
        assertEquals("HIGH", report.getAdvisories().get(0).getSeverity());
        assertEquals("HIGH", report.getAdvisories().get(1).getSeverity());
        assertEquals("WARNING", report.getAdvisories().get(2).getSeverity());
    }

    @Test
    void testForecastOutsideConfiguredHorizonIgnored() {
        // Adverse condition at index 3 (hour 4)
        List<String> times = Arrays.asList("T1", "T2", "T3", "T4");
        List<Integer> probs = Arrays.asList(10, 10, 10, 90);
        List<Double> precips = Arrays.asList(0.0, 0.0, 0.0, 25.0);
        List<Double> winds = Arrays.asList(10.0, 10.0, 10.0, 10.0);
        List<Integer> codes = Arrays.asList(0, 0, 0, 0);

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(25.0, 10.0, 0, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        // Limit horizon to 2 hours
        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(2, true);

        // T4 at index 3 should not be evaluated because horizon is 2 hours
        assertEquals(1, report.getAdvisories().size());
        assertEquals("ADV-NORMAL-COND", report.getAdvisories().get(0).getId());
    }

    @Test
    void testMissingOrIncompleteForecastFieldsHandling() {
        OpenMeteoClient.OpenMeteoResponse emptyResponse = new OpenMeteoClient.OpenMeteoResponse();
        emptyResponse.setLatitude(19.076);
        emptyResponse.setLongitude(72.8777);
        emptyResponse.setCurrent_weather(null);
        emptyResponse.setHourly(null);

        WarehouseForecastReportDto report = openMeteoClient.evaluateAdvisories(emptyResponse, 48);

        assertNotNull(report);
        assertEquals(1, report.getAdvisories().size());
        assertEquals("ADV-NORMAL-COND", report.getAdvisories().get(0).getId());
    }

    @Test
    void testExternalApiFailureAndTimeoutFallback() {
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenThrow(new RestClientException("Connection timed out"));

        WarehouseForecastReportDto report = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);

        assertNotNull(report);
        assertTrue(report.getStatus().contains("UNAVAILABLE"));
        assertEquals(1, report.getAdvisories().size());
        assertEquals("ADV-CONN-FAIL", report.getAdvisories().get(0).getId());
        assertEquals("WARNING", report.getAdvisories().get(0).getSeverity());
        assertTrue(report.getAdvisories().get(0).getTitle().contains("Temporarily Unavailable"));
    }

    @Test
    void testCachedResponseReuse() {
        List<String> times = Arrays.asList("2026-10-22T12:00");
        List<Integer> probs = Arrays.asList(10);
        List<Double> precips = Arrays.asList(0.0);
        List<Double> winds = Arrays.asList(10.0);
        List<Integer> codes = Arrays.asList(0);

        OpenMeteoClient.OpenMeteoResponse mockResponse = createMockForecastResponse(25.0, 10.0, 0, times, probs, precips, winds, codes);
        when(restTemplate.getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class)))
                .thenReturn(mockResponse);

        // Call 1
        WarehouseForecastReportDto report1 = openMeteoClient.getWarehouseForecastAndAdvisories(48, false);
        // Call 2 (within cache duration, without force refresh)
        WarehouseForecastReportDto report2 = openMeteoClient.getWarehouseForecastAndAdvisories(48, false);

        assertSame(report1, report2);
        // RestTemplate was called only once
        verify(restTemplate, times(1)).getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class));

        // Call 3 with forceRefresh = true
        WarehouseForecastReportDto report3 = openMeteoClient.getWarehouseForecastAndAdvisories(48, true);
        assertNotNull(report3);
        verify(restTemplate, times(2)).getForObject(anyString(), eq(OpenMeteoClient.OpenMeteoResponse.class));
    }

    @Test
    void testCustomConfigurationConstructor() {
        OpenMeteoClient customClient = new OpenMeteoClient(
                restTemplateBuilder,
                "https://custom-weather.api/forecast",
                "Bengaluru Logistics Park",
                12.9716,
                77.5946,
                30
        );
        assertNotNull(customClient);
    }

    @Test
    void testPrecipitationThresholdExactBoundaries() {
        List<String> times = Arrays.asList("2026-10-22T12:00");

        // Exactly at boundary: 70% and 5.0 mm -> WARNING
        OpenMeteoClient.OpenMeteoResponse r1 = createMockForecastResponse(25.0, 10.0, 0,
                times, Arrays.asList(70), Arrays.asList(5.0), Arrays.asList(10.0), Arrays.asList(0));
        WarehouseForecastReportDto report1 = openMeteoClient.evaluateAdvisories(r1, 24);
        assertEquals(1, report1.getAdvisories().size());
        assertEquals("ADV-PRECIP-HEAVY", report1.getAdvisories().get(0).getId());
        assertEquals("WARNING", report1.getAdvisories().get(0).getSeverity());

        // Exactly at boundary: 70% and 15.0 mm -> HIGH
        OpenMeteoClient.OpenMeteoResponse r2 = createMockForecastResponse(25.0, 10.0, 0,
                times, Arrays.asList(70), Arrays.asList(15.0), Arrays.asList(10.0), Arrays.asList(0));
        WarehouseForecastReportDto report2 = openMeteoClient.evaluateAdvisories(r2, 24);
        assertEquals("HIGH", report2.getAdvisories().get(0).getSeverity());

        // Just below probability boundary: 69% and 10.0 mm -> NORMAL
        OpenMeteoClient.OpenMeteoResponse r3 = createMockForecastResponse(25.0, 10.0, 0,
                times, Arrays.asList(69), Arrays.asList(10.0), Arrays.asList(10.0), Arrays.asList(0));
        WarehouseForecastReportDto report3 = openMeteoClient.evaluateAdvisories(r3, 24);
        assertEquals("ADV-NORMAL-COND", report3.getAdvisories().get(0).getId());

        // Just below precipitation boundary: 80% and 4.9 mm -> NORMAL
        OpenMeteoClient.OpenMeteoResponse r4 = createMockForecastResponse(25.0, 10.0, 0,
                times, Arrays.asList(80), Arrays.asList(4.9), Arrays.asList(10.0), Arrays.asList(0));
        WarehouseForecastReportDto report4 = openMeteoClient.evaluateAdvisories(r4, 24);
        assertEquals("ADV-NORMAL-COND", report4.getAdvisories().get(0).getId());
    }

    @Test
    void testWindSpeedThresholdExactBoundaries() {
        List<String> times = Arrays.asList("2026-10-22T12:00");

        // Exactly at boundary: 35.0 km/h -> WARNING
        OpenMeteoClient.OpenMeteoResponse r1 = createMockForecastResponse(25.0, 10.0, 0,
                times, Arrays.asList(10), Arrays.asList(0.0), Arrays.asList(35.0), Arrays.asList(0));
        WarehouseForecastReportDto report1 = openMeteoClient.evaluateAdvisories(r1, 24);
        assertEquals(1, report1.getAdvisories().size());
        assertEquals("ADV-WIND-HIGH", report1.getAdvisories().get(0).getId());
        assertEquals("WARNING", report1.getAdvisories().get(0).getSeverity());

        // Exactly at boundary: 50.0 km/h -> HIGH
        OpenMeteoClient.OpenMeteoResponse r2 = createMockForecastResponse(25.0, 10.0, 0,
                times, Arrays.asList(10), Arrays.asList(0.0), Arrays.asList(50.0), Arrays.asList(0));
        WarehouseForecastReportDto report2 = openMeteoClient.evaluateAdvisories(r2, 24);
        assertEquals("HIGH", report2.getAdvisories().get(0).getSeverity());

        // Just below boundary: 34.9 km/h -> NORMAL
        OpenMeteoClient.OpenMeteoResponse r3 = createMockForecastResponse(25.0, 10.0, 0,
                times, Arrays.asList(10), Arrays.asList(0.0), Arrays.asList(34.9), Arrays.asList(0));
        WarehouseForecastReportDto report3 = openMeteoClient.evaluateAdvisories(r3, 24);
        assertEquals("ADV-NORMAL-COND", report3.getAdvisories().get(0).getId());
    }

    @Test
    void testAllWeatherCodeCategoriesDecoding() {
        assertEquals("Clear Sky", openMeteoClient.decodeWeatherCode(0));
        assertEquals("Mainly Clear", openMeteoClient.decodeWeatherCode(1));
        assertEquals("Partly Cloudy", openMeteoClient.decodeWeatherCode(2));
        assertEquals("Overcast", openMeteoClient.decodeWeatherCode(3));
        assertTrue(openMeteoClient.decodeWeatherCode(45).contains("Fog"));
        assertTrue(openMeteoClient.decodeWeatherCode(51).contains("Drizzle"));
        assertTrue(openMeteoClient.decodeWeatherCode(61).contains("Rain"));
        assertTrue(openMeteoClient.decodeWeatherCode(71).contains("Snow"));
        assertTrue(openMeteoClient.decodeWeatherCode(95).contains("Thunderstorm"));
        assertTrue(openMeteoClient.decodeWeatherCode(96).contains("Hail"));
        assertTrue(openMeteoClient.decodeWeatherCode(999).contains("Fair / Moderate"));
    }
}
