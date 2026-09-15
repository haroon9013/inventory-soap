package com.example.inventory.client;

import com.example.inventory.dto.CurrencyInfoDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class FrankfurterClientTest {

    private RestTemplate restTemplate;
    private RestTemplateBuilder restTemplateBuilder;
    private FrankfurterClient frankfurterClient;

    @BeforeEach
    void setUp() {
        restTemplate = mock(RestTemplate.class);
        restTemplateBuilder = mock(RestTemplateBuilder.class);
        when(restTemplateBuilder.connectTimeout(any(Duration.class))).thenReturn(restTemplateBuilder);
        when(restTemplateBuilder.readTimeout(any(Duration.class))).thenReturn(restTemplateBuilder);
        when(restTemplateBuilder.build()).thenReturn(restTemplate);

        frankfurterClient = new FrankfurterClient(restTemplateBuilder, "https://api.frankfurter.dev/v1");
    }

    @Test
    void testConvertCurrencySuccess() {
        FrankfurterClient.FrankfurterResponse mockResponse = new FrankfurterClient.FrankfurterResponse();
        mockResponse.setAmount(1.0);
        mockResponse.setBase("EUR");
        mockResponse.setDate("2026-09-11");
        Map<String, Double> rates = new HashMap<>();
        rates.put("USD", 1.1592);
        mockResponse.setRates(rates);

        when(restTemplate.getForObject(anyString(), eq(FrankfurterClient.FrankfurterResponse.class)))
                .thenReturn(mockResponse);

        CurrencyInfoDto result = frankfurterClient.convertCurrency(100.0, "EUR", "USD");

        assertNotNull(result);
        assertEquals("EUR", result.getBaseCurrency());
        assertEquals("USD", result.getTargetCurrency());
        assertEquals(1.1592, result.getExchangeRate());
        assertEquals(115.92, result.getConvertedPrice());
        assertTrue(result.getStatus().contains("SUCCESS"));
    }

    @Test
    void testConvertCurrencyApiFailureFallback() {
        when(restTemplate.getForObject(anyString(), eq(FrankfurterClient.FrankfurterResponse.class)))
                .thenThrow(new RestClientException("Connection timed out"));

        CurrencyInfoDto result = frankfurterClient.convertCurrency(100.0, "EUR", "USD");

        assertNotNull(result);
        assertEquals("EUR", result.getBaseCurrency());
        assertEquals("USD", result.getTargetCurrency());
        assertEquals(0.0, result.getExchangeRate());
        assertEquals(100.0, result.getConvertedPrice());
        assertTrue(result.getStatus().contains("UNAVAILABLE"));
    }
}
