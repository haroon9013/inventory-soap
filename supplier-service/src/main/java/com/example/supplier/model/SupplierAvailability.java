package com.example.supplier.model;

public class SupplierAvailability {

    private int productId;
    private String supplierName;
    private int availableQuantity;
    private double supplierPrice;
    private boolean available;

    public SupplierAvailability() {
    }

    public SupplierAvailability(int productId, String supplierName, int availableQuantity, double supplierPrice, boolean available) {
        this.productId = productId;
        this.supplierName = supplierName;
        this.availableQuantity = availableQuantity;
        this.supplierPrice = supplierPrice;
        this.available = available;
    }

    public int getProductId() {
        return productId;
    }

    public void setProductId(int productId) {
        this.productId = productId;
    }

    public String getSupplierName() {
        return supplierName;
    }

    public void setSupplierName(String supplierName) {
        this.supplierName = supplierName;
    }

    public int getAvailableQuantity() {
        return availableQuantity;
    }

    public void setAvailableQuantity(int availableQuantity) {
        this.availableQuantity = availableQuantity;
    }

    public double getSupplierPrice() {
        return supplierPrice;
    }

    public void setSupplierPrice(double supplierPrice) {
        this.supplierPrice = supplierPrice;
    }

    public boolean isAvailable() {
        return available;
    }

    public void setAvailable(boolean available) {
        this.available = available;
    }
}
