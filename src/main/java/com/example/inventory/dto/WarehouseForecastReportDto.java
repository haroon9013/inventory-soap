package com.example.inventory.dto;

import java.util.ArrayList;
import java.util.List;

public class WarehouseForecastReportDto {

    private String location;
    private double latitude;
    private double longitude;
    private String retrievalTime;
    private int forecastHorizonHours;
    private double currentTemperature;
    private double currentWindSpeed;
    private String currentCondition;
    private String status;
    private List<WeatherAdvisoryDto> advisories = new ArrayList<>();

    public WarehouseForecastReportDto() {
    }

    public WarehouseForecastReportDto(String location, double latitude, double longitude,
                                      String retrievalTime, int forecastHorizonHours,
                                      double currentTemperature, double currentWindSpeed,
                                      String currentCondition, String status,
                                      List<WeatherAdvisoryDto> advisories) {
        this.location = location;
        this.latitude = latitude;
        this.longitude = longitude;
        this.retrievalTime = retrievalTime;
        this.forecastHorizonHours = forecastHorizonHours;
        this.currentTemperature = currentTemperature;
        this.currentWindSpeed = currentWindSpeed;
        this.currentCondition = currentCondition;
        this.status = status;
        this.advisories = advisories != null ? advisories : new ArrayList<>();
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
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

    public String getRetrievalTime() {
        return retrievalTime;
    }

    public void setRetrievalTime(String retrievalTime) {
        this.retrievalTime = retrievalTime;
    }

    public int getForecastHorizonHours() {
        return forecastHorizonHours;
    }

    public void setForecastHorizonHours(int forecastHorizonHours) {
        this.forecastHorizonHours = forecastHorizonHours;
    }

    public double getCurrentTemperature() {
        return currentTemperature;
    }

    public void setCurrentTemperature(double currentTemperature) {
        this.currentTemperature = currentTemperature;
    }

    public double getCurrentWindSpeed() {
        return currentWindSpeed;
    }

    public void setCurrentWindSpeed(double currentWindSpeed) {
        this.currentWindSpeed = currentWindSpeed;
    }

    public String getCurrentCondition() {
        return currentCondition;
    }

    public void setCurrentCondition(String currentCondition) {
        this.currentCondition = currentCondition;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public List<WeatherAdvisoryDto> getAdvisories() {
        return advisories;
    }

    public void setAdvisories(List<WeatherAdvisoryDto> advisories) {
        this.advisories = advisories != null ? advisories : new ArrayList<>();
    }
}
