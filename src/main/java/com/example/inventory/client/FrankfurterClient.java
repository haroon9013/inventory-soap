package com.example.inventory.client;

import com.example.inventory.dto.CurrencyInfoDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.Map;

@Component
public class FrankfurterClient {

    private static final Logger log = LoggerFactory.getLogger(FrankfurterClient.class);

    private final RestTemplate restTemplate;
    private final String frankfurterApiUrl;

    public FrankfurterClient(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${frankfurter.api.url:https://api.frankfurter.dev/v1}") String frankfurterApiUrl) {
        this.restTemplate = restTemplateBuilder
                .connectTimeout(Duration.ofSeconds(4))
                .readTimeout(Duration.ofSeconds(4))
                .build();
        this.frankfurterApiUrl = frankfurterApiUrl;
    }

    public CurrencyInfoDto convertCurrency(double amount, String baseCurrency, String targetCurrency) {
        if (baseCurrency == null || targetCurrency == null) {
            return new CurrencyInfoDto(
                    baseCurrency != null ? baseCurrency : "UNKNOWN",
                    targetCurrency != null ? targetCurrency : "UNKNOWN",
                    0.0,
                    amount,
                    "ERROR: Source and target currencies must be specified"
            );
        }

        String base = baseCurrency.trim().toUpperCase();
        String target = targetCurrency.trim().toUpperCase();

        // Same-currency optimization: do not perform external HTTP request when currencies match
        if (base.equals(target)) {
            return new CurrencyInfoDto(
                    base,
                    target,
                    1.0,
                    amount,
                    "SUCCESS: Same currency (no conversion needed)"
            );
        }

        String url = String.format("%s/latest?from=%s&to=%s", frankfurterApiUrl, base, target);
        try {
            FrankfurterResponse response = restTemplate.getForObject(url, FrankfurterResponse.class);

            if (response != null && response.getRates() != null && response.getRates().containsKey(target)) {
                double rate = response.getRates().get(target);
                double converted = BigDecimal.valueOf(amount * rate)
                        .setScale(2, RoundingMode.HALF_UP)
                        .doubleValue();

                String dateStr = response.getDate() != null ? response.getDate() : "latest";
                return new CurrencyInfoDto(
                        base,
                        target,
                        rate,
                        converted,
                        "SUCCESS: Live rate from Frankfurter API (date: " + dateStr + ")"
                );
            }
        } catch (RestClientException ex) {
            log.warn("Frankfurter API call failed at {}: {}", url, ex.getMessage());
        } catch (Exception ex) {
            log.error("Unexpected error during Frankfurter API currency conversion: {}", ex.getMessage());
        }

        // Resilient fallback when API is down or unreachable
        return new CurrencyInfoDto(
                base,
                target,
                0.0,
                amount,
                "UNAVAILABLE: Unable to connect to Frankfurter API at " + frankfurterApiUrl
        );
    }

    // Inner DTO matching Frankfurter JSON response
    public static class FrankfurterResponse {
        private double amount;
        private String base;
        private String date;
        private Map<String, Double> rates;

        public FrankfurterResponse() {
        }

        public double getAmount() {
            return amount;
        }

        public void setAmount(double amount) {
            this.amount = amount;
        }

        public String getBase() {
            return base;
        }

        public void setBase(String base) {
            this.base = base;
        }

        public String getDate() {
            return date;
        }

        public void setDate(String date) {
            this.date = date;
        }

        public Map<String, Double> getRates() {
            return rates;
        }

        public void setRates(Map<String, Double> rates) {
            this.rates = rates;
        }
    }
}
