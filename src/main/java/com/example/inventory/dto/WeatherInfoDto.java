package com.example.inventory.dto;

public class WeatherInfoDto {

    private String location;
    private double temperature;
    private double windSpeed;
    private String weatherCondition;
    private String status;

    public WeatherInfoDto() {
    }

    public WeatherInfoDto(String location, double temperature, double windSpeed, String weatherCondition, String status) {
        this.location = location;
        this.temperature = temperature;
        this.windSpeed = windSpeed;
        this.weatherCondition = weatherCondition;
        this.status = status;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public double getTemperature() {
        return temperature;
    }

    public void setTemperature(double temperature) {
        this.temperature = temperature;
    }

    public double getWindSpeed() {
        return windSpeed;
    }

    public void setWindSpeed(double windSpeed) {
        this.windSpeed = windSpeed;
    }

    public String getWeatherCondition() {
        return weatherCondition;
    }

    public void setWeatherCondition(String weatherCondition) {
        this.weatherCondition = weatherCondition;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
