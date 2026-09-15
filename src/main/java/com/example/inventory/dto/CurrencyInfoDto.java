package com.example.inventory.dto;

public class CurrencyInfoDto {

    private String baseCurrency;
    private String targetCurrency;
    private double exchangeRate;
    private double convertedPrice;
    private String status;

    public CurrencyInfoDto() {
    }

    public CurrencyInfoDto(String baseCurrency, String targetCurrency, double exchangeRate, double convertedPrice, String status) {
        this.baseCurrency = baseCurrency;
        this.targetCurrency = targetCurrency;
        this.exchangeRate = exchangeRate;
        this.convertedPrice = convertedPrice;
        this.status = status;
    }

    public String getBaseCurrency() {
        return baseCurrency;
    }

    public void setBaseCurrency(String baseCurrency) {
        this.baseCurrency = baseCurrency;
    }

    public String getTargetCurrency() {
        return targetCurrency;
    }

    public void setTargetCurrency(String targetCurrency) {
        this.targetCurrency = targetCurrency;
    }

    public double getExchangeRate() {
        return exchangeRate;
    }

    public void setExchangeRate(double exchangeRate) {
        this.exchangeRate = exchangeRate;
    }

    public double getConvertedPrice() {
        return convertedPrice;
    }

    public void setConvertedPrice(double convertedPrice) {
        this.convertedPrice = convertedPrice;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
