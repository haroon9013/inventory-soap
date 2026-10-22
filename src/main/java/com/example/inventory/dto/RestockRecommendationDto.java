package com.example.inventory.dto;

public class RestockRecommendationDto {

    private int productId;
    private String productName;
    private String category;
    private int currentQuantity;
    private int targetQuantity;
    private int suggestedQuantity;
    private String urgency;
    private String reason;
    private boolean candidate;

    public RestockRecommendationDto() {
    }

    public RestockRecommendationDto(int productId, String productName, String category,
                                  int currentQuantity, int targetQuantity, int suggestedQuantity,
                                  String urgency, String reason, boolean candidate) {
        this.productId = productId;
        this.productName = productName;
        this.category = category;
        this.currentQuantity = currentQuantity;
        this.targetQuantity = targetQuantity;
        this.suggestedQuantity = suggestedQuantity;
        this.urgency = urgency;
        this.reason = reason;
        this.candidate = candidate;
    }

    public int getProductId() {
        return productId;
    }

    public void setProductId(int productId) {
        this.productId = productId;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public int getCurrentQuantity() {
        return currentQuantity;
    }

    public void setCurrentQuantity(int currentQuantity) {
        this.currentQuantity = currentQuantity;
    }

    public int getTargetQuantity() {
        return targetQuantity;
    }

    public void setTargetQuantity(int targetQuantity) {
        this.targetQuantity = targetQuantity;
    }

    public int getSuggestedQuantity() {
        return suggestedQuantity;
    }

    public void setSuggestedQuantity(int suggestedQuantity) {
        this.suggestedQuantity = suggestedQuantity;
    }

    public String getUrgency() {
        return urgency;
    }

    public void setUrgency(String urgency) {
        this.urgency = urgency;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public boolean isCandidate() {
        return candidate;
    }

    public void setCandidate(boolean candidate) {
        this.candidate = candidate;
    }
}
