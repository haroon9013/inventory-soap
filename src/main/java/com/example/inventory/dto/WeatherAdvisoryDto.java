package com.example.inventory.dto;

public class WeatherAdvisoryDto {

    private String id;
    private String severity;
    private String title;
    private String description;
    private String expectedTime;
    private String triggerConditions;
    private String recommendedAction;
    private String disclaimer;

    public WeatherAdvisoryDto() {
    }

    public WeatherAdvisoryDto(String id, String severity, String title, String description,
                              String expectedTime, String triggerConditions,
                              String recommendedAction, String disclaimer) {
        this.id = id;
        this.severity = severity;
        this.title = title;
        this.description = description;
        this.expectedTime = expectedTime;
        this.triggerConditions = triggerConditions;
        this.recommendedAction = recommendedAction;
        this.disclaimer = disclaimer;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getSeverity() {
        return severity;
    }

    public void setSeverity(String severity) {
        this.severity = severity;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getExpectedTime() {
        return expectedTime;
    }

    public void setExpectedTime(String expectedTime) {
        this.expectedTime = expectedTime;
    }

    public String getTriggerConditions() {
        return triggerConditions;
    }

    public void setTriggerConditions(String triggerConditions) {
        this.triggerConditions = triggerConditions;
    }

    public String getRecommendedAction() {
        return recommendedAction;
    }

    public void setRecommendedAction(String recommendedAction) {
        this.recommendedAction = recommendedAction;
    }

    public String getDisclaimer() {
        return disclaimer;
    }

    public void setDisclaimer(String disclaimer) {
        this.disclaimer = disclaimer;
    }
}
