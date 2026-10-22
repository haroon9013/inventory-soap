package com.example.inventory.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "stock_movements")
public class StockMovementEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Integer productId;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "movement_type", nullable = false)
    private String movementType;

    @Column(name = "previous_quantity", nullable = false)
    private Integer previousQuantity;

    @Column(name = "new_quantity", nullable = false)
    private Integer newQuantity;

    @Column(name = "quantity_change", nullable = false)
    private Integer quantityChange;

    @Column(name = "reason")
    private String reason;

    @Column(name = "timestamp", nullable = false)
    private LocalDateTime timestamp;

    @Column(name = "reference")
    private String reference;

    public StockMovementEntity() {
    }

    public StockMovementEntity(
            Integer productId,
            String productName,
            String movementType,
            Integer previousQuantity,
            Integer newQuantity,
            Integer quantityChange,
            String reason,
            LocalDateTime timestamp,
            String reference) {
        this.productId = productId;
        this.productName = productName;
        this.movementType = movementType;
        this.previousQuantity = previousQuantity;
        this.newQuantity = newQuantity;
        this.quantityChange = quantityChange;
        this.reason = reason;
        this.timestamp = timestamp;
        this.reference = reference;
    }

    public StockMovementEntity(
            Long id,
            Integer productId,
            String productName,
            String movementType,
            Integer previousQuantity,
            Integer newQuantity,
            Integer quantityChange,
            String reason,
            LocalDateTime timestamp,
            String reference) {
        this.id = id;
        this.productId = productId;
        this.productName = productName;
        this.movementType = movementType;
        this.previousQuantity = previousQuantity;
        this.newQuantity = newQuantity;
        this.quantityChange = quantityChange;
        this.reason = reason;
        this.timestamp = timestamp;
        this.reference = reference;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Integer getProductId() {
        return productId;
    }

    public void setProductId(Integer productId) {
        this.productId = productId;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public String getMovementType() {
        return movementType;
    }

    public void setMovementType(String movementType) {
        this.movementType = movementType;
    }

    public Integer getPreviousQuantity() {
        return previousQuantity;
    }

    public void setPreviousQuantity(Integer previousQuantity) {
        this.previousQuantity = previousQuantity;
    }

    public Integer getNewQuantity() {
        return newQuantity;
    }

    public void setNewQuantity(Integer newQuantity) {
        this.newQuantity = newQuantity;
    }

    public Integer getQuantityChange() {
        return quantityChange;
    }

    public void setQuantityChange(Integer quantityChange) {
        this.quantityChange = quantityChange;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }
}
