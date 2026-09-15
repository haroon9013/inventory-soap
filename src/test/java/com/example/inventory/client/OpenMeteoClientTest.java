package com.example.inventory.client;

import com.example.inventory.dto.WeatherInfoDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

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
                72.8777
        );
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
}
