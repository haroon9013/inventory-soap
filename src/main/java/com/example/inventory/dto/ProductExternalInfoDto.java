package com.example.inventory.dto;

import com.example.inventory.generated.Product;

public class ProductExternalInfoDto {

    private boolean success;
    private String message;
    private Product product;
    private SupplierAvailabilityDto supplierInfo;
    private CurrencyInfoDto currencyInfo;
    private WeatherInfoDto weatherInfo;

    public ProductExternalInfoDto() {
    }

    public ProductExternalInfoDto(boolean success, String message, Product product, SupplierAvailabilityDto supplierInfo, CurrencyInfoDto currencyInfo, WeatherInfoDto weatherInfo) {
        this.success = success;
        this.message = message;
        this.product = product;
        this.supplierInfo = supplierInfo;
        this.currencyInfo = currencyInfo;
        this.weatherInfo = weatherInfo;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Product getProduct() {
        return product;
    }

    public void setProduct(Product product) {
        this.product = product;
    }

    public SupplierAvailabilityDto getSupplierInfo() {
        return supplierInfo;
    }

    public void setSupplierInfo(SupplierAvailabilityDto supplierInfo) {
        this.supplierInfo = supplierInfo;
    }

    public CurrencyInfoDto getCurrencyInfo() {
        return currencyInfo;
    }

    public void setCurrencyInfo(CurrencyInfoDto currencyInfo) {
        this.currencyInfo = currencyInfo;
    }

    public WeatherInfoDto getWeatherInfo() {
        return weatherInfo;
    }

    public void setWeatherInfo(WeatherInfoDto weatherInfo) {
        this.weatherInfo = weatherInfo;
    }
}
