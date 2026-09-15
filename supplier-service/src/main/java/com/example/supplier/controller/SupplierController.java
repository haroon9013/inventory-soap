package com.example.supplier.controller;

import com.example.supplier.model.SupplierAvailability;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/supplier")
@CrossOrigin(origins = "*")
public class SupplierController {

    private final Map<Integer, SupplierAvailability> supplierCatalog = new ConcurrentHashMap<>();

    public SupplierController() {
        // Pre-seeded supplier catalog for demonstration
        supplierCatalog.put(101, new SupplierAvailability(101, "Global Tech Logistics", 150, 48000.0, true));
        supplierCatalog.put(102, new SupplierAvailability(102, "Prime Wholesale Dist.", 85, 2900.0, true));
        supplierCatalog.put(103, new SupplierAvailability(103, "Apex Electronics Hub", 220, 15500.0, true));
        supplierCatalog.put(999, new SupplierAvailability(999, "Inactive Partner Co.", 0, 0.0, false));
    }

    @GetMapping("/availability/{productId}")
    public ResponseEntity<SupplierAvailability> checkSupplierAvailability(@PathVariable int productId) {
        if (productId <= 0) {
            return ResponseEntity.ok(new SupplierAvailability(productId, "Unknown Supplier", 0, 0.0, false));
        }

        SupplierAvailability availability = supplierCatalog.get(productId);

        if (availability != null) {
            return ResponseEntity.ok(availability);
        }

        // Deterministic fallback for any other valid product ID
        int generatedQty = 50 + (productId % 150);
        double generatedPrice = 1000.0 + (productId * 25.0);
        SupplierAvailability defaultSupplier = new SupplierAvailability(
                productId,
                "National Wholesale Network",
                generatedQty,
                generatedPrice,
                true
        );

        return ResponseEntity.ok(defaultSupplier);
    }
}
