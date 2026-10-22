package com.example.inventory.client;

import com.example.inventory.dto.SupplierAvailabilityDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SupplierClientTest {

    private RestTemplate restTemplate;
    private RestTemplateBuilder restTemplateBuilder;
    private SupplierClient supplierClient;

    @BeforeEach
    void setUp() {
        restTemplate = mock(RestTemplate.class);
        restTemplateBuilder = mock(RestTemplateBuilder.class);
        when(restTemplateBuilder.connectTimeout(any(Duration.class))).thenReturn(restTemplateBuilder);
        when(restTemplateBuilder.readTimeout(any(Duration.class))).thenReturn(restTemplateBuilder);
        when(restTemplateBuilder.build()).thenReturn(restTemplate);

        supplierClient = new SupplierClient(restTemplateBuilder, "http://localhost:8081");
    }

    @Test
    void testCheckSupplierAvailabilitySuccess() {
        SupplierAvailabilityDto mockDto = new SupplierAvailabilityDto(
                101, "Global Tech Logistics", 150, 48000.0, true, "OK"
        );
        when(restTemplate.getForObject(contains("/api/supplier/availability/101"), eq(SupplierAvailabilityDto.class)))
                .thenReturn(mockDto);

        SupplierAvailabilityDto result = supplierClient.checkSupplierAvailability(101);

        assertNotNull(result);
        assertEquals(101, result.getProductId());
        assertEquals("Global Tech Logistics", result.getSupplierName());
        assertEquals(150, result.getAvailableQuantity());
        assertEquals(48000.0, result.getSupplierPrice());
        assertTrue(result.isAvailable());
        assertTrue(result.getMessage().contains("Retrieved from Supplier Service"));
    }

    @Test
    void testCheckSupplierAvailabilityTimeoutReturnsHonestUnavailableState() {
        when(restTemplate.getForObject(anyString(), eq(SupplierAvailabilityDto.class)))
                .thenThrow(new ResourceAccessException("I/O error: Read timed out"));

        SupplierAvailabilityDto result = supplierClient.checkSupplierAvailability(101);

        assertNotNull(result);
        assertEquals(101, result.getProductId());
        assertEquals("Supplier Service Unavailable", result.getSupplierName());
        assertEquals(0, result.getAvailableQuantity());
        assertEquals(0.0, result.getSupplierPrice());
        assertFalse(result.isAvailable());
        assertTrue(result.getMessage().contains("Unable to connect to Supplier Service"));
    }

    @Test
    void testCheckSupplierAvailabilityHttp500ReturnsHonestUnavailableState() {
        when(restTemplate.getForObject(anyString(), eq(SupplierAvailabilityDto.class)))
                .thenThrow(new HttpServerErrorException(HttpStatus.INTERNAL_SERVER_ERROR, "Server Error"));

        SupplierAvailabilityDto result = supplierClient.checkSupplierAvailability(102);

        assertNotNull(result);
        assertEquals(102, result.getProductId());
        assertEquals("Supplier Service Unavailable", result.getSupplierName());
        assertFalse(result.isAvailable());
        assertTrue(result.getMessage().contains("Unable to connect"));
    }

    @Test
    void testCheckSupplierAvailabilityNullResponseReturnsHonestUnavailableState() {
        when(restTemplate.getForObject(anyString(), eq(SupplierAvailabilityDto.class)))
                .thenReturn(null);

        SupplierAvailabilityDto result = supplierClient.checkSupplierAvailability(103);

        assertNotNull(result);
        assertEquals(103, result.getProductId());
        assertEquals("Supplier Service Unavailable", result.getSupplierName());
        assertFalse(result.isAvailable());
        assertTrue(result.getMessage().contains("Unable to connect"));
    }
}
