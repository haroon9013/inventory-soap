package com.example.inventory.client;

import com.example.inventory.dto.SupplierAvailabilityDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Component
public class SupplierClient {

    private static final Logger log = LoggerFactory.getLogger(SupplierClient.class);

    private final RestTemplate restTemplate;
    private final String supplierServiceUrl;

    public SupplierClient(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${supplier.service.url:http://localhost:8081}") String supplierServiceUrl) {
        this.restTemplate = restTemplateBuilder
                .connectTimeout(Duration.ofSeconds(3))
                .readTimeout(Duration.ofSeconds(3))
                .build();
        this.supplierServiceUrl = supplierServiceUrl;
    }

    public SupplierAvailabilityDto checkSupplierAvailability(int productId) {
        String url = supplierServiceUrl + "/api/supplier/availability/" + productId;
        try {
            SupplierAvailabilityDto response = restTemplate.getForObject(url, SupplierAvailabilityDto.class);
            if (response != null) {
                response.setMessage("Retrieved from Supplier Service (distributed network call)");
                return response;
            }
        } catch (RestClientException ex) {
            log.warn("Failed to communicate with Supplier Service at {}: {}", url, ex.getMessage());
        }

        // Graceful fallback if supplier service is unreachable
        return new SupplierAvailabilityDto(
                productId,
                "Supplier Service Unavailable",
                0,
                0.0,
                false,
                "Unable to connect to Supplier Service at " + supplierServiceUrl + ". Please ensure Supplier Service is running on port 8081."
        );
    }
}
