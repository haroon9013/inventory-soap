package com.example.inventory.controller;

import com.example.inventory.dto.ProductExternalInfoDto;
import com.example.inventory.dto.SupplierAvailabilityDto;
import com.example.inventory.generated.Product;
import com.example.inventory.service.InventoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/products")
public class InventoryController {

    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> addProduct(
            @RequestBody Product product) {

        boolean added = inventoryService.addProduct(product);

        Map<String, Object> response = new HashMap<>();
        response.put("success", added);
        response.put("message", added
                ? "Product added successfully"
                : "Product with ID " + product.getId() + " already exists");

        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getProduct(
            @PathVariable int id) {

        Map<String, Object> response = new HashMap<>();

        inventoryService.getProduct(id).ifPresentOrElse(
                product -> {
                    response.put("success", true);
                    response.put("message", "Product found successfully");
                    response.put("product", product);
                },
                () -> {
                    response.put("success", false);
                    response.put("message",
                            "Product with ID " + id + " not found");
                }
        );

        return ResponseEntity.ok(response);
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> updateProduct(
            @RequestBody Product product) {

        boolean updated = inventoryService.updateProduct(product);

        Map<String, Object> response = new HashMap<>();
        response.put("success", updated);
        response.put("message", updated
                ? "Product updated successfully"
                : "Product with ID " + product.getId() + " not found");

        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteProduct(
            @PathVariable int id) {

        boolean deleted = inventoryService.deleteProduct(id);

        Map<String, Object> response = new HashMap<>();
        response.put("success", deleted);
        response.put("message", deleted
                ? "Product deleted successfully"
                : "Product with ID " + id + " not found");

        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}/supplier")
    public ResponseEntity<SupplierAvailabilityDto> checkSupplierAvailability(
            @PathVariable int id) {

        SupplierAvailabilityDto response = inventoryService.checkSupplierAvailability(id);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}/external-info")
    public ResponseEntity<ProductExternalInfoDto> getProductExternalInfo(
            @PathVariable int id) {

        ProductExternalInfoDto response = inventoryService.getProductExternalInfo(id);
        return ResponseEntity.ok(response);
    }
}