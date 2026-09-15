package com.example.inventory.service;

import org.springframework.beans.factory.annotation.Autowired;
import com.example.inventory.client.FrankfurterClient;
import com.example.inventory.client.OpenMeteoClient;
import com.example.inventory.client.SupplierClient;
import com.example.inventory.dto.CurrencyInfoDto;
import com.example.inventory.dto.ProductExternalInfoDto;
import com.example.inventory.dto.SupplierAvailabilityDto;
import com.example.inventory.dto.WeatherInfoDto;
import com.example.inventory.entity.ProductEntity;
import com.example.inventory.generated.Product;
import com.example.inventory.repository.ProductRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class InventoryService {

    private final ProductRepository productRepository;
    private final SupplierClient supplierClient;
    private final FrankfurterClient frankfurterClient;
    private final OpenMeteoClient openMeteoClient;
    @Autowired
    public InventoryService(
            ProductRepository productRepository,
            SupplierClient supplierClient,
            FrankfurterClient frankfurterClient,
            OpenMeteoClient openMeteoClient) {
        this.productRepository = productRepository;
        this.supplierClient = supplierClient;
        this.frankfurterClient = frankfurterClient;
        this.openMeteoClient = openMeteoClient;
    }

    public InventoryService(ProductRepository productRepository, SupplierClient supplierClient) {
        this(productRepository, supplierClient, null, null);
    }

    public InventoryService(ProductRepository productRepository) {
        this(productRepository, null, null, null);
    }

    public boolean addProduct(Product product) {
        if (productRepository.existsById(product.getId())) {
            return false;
        }

        ProductEntity entity = toEntity(product);
        productRepository.save(entity);
        return true;
    }

    public Optional<Product> getProduct(int id) {
        return productRepository.findById(id).map(this::toDto);
    }

    public boolean updateProduct(Product product) {
        if (!productRepository.existsById(product.getId())) {
            return false;
        }

        ProductEntity entity = toEntity(product);
        productRepository.save(entity);
        return true;
    }

    public boolean deleteProduct(int id) {
        if (!productRepository.existsById(id)) {
            return false;
        }

        productRepository.deleteById(id);
        return true;
    }

    public SupplierAvailabilityDto checkSupplierAvailability(int productId) {
        if (supplierClient != null) {
            return supplierClient.checkSupplierAvailability(productId);
        }
        return new SupplierAvailabilityDto(
                productId,
                "Supplier Service Not Configured",
                0,
                0.0,
                false,
                "Supplier client is not initialized"
        );
    }

    public ProductExternalInfoDto getProductExternalInfo(int productId) {
        Optional<ProductEntity> entityOpt = productRepository.findById(productId);

        if (entityOpt.isEmpty()) {
            return new ProductExternalInfoDto(
                    false,
                    "Product with ID " + productId + " not found",
                    null,
                    null,
                    null,
                    null
            );
        }

        Product product = toDto(entityOpt.get());

        // 1. Supplier Information (from Supplier Service :8081)
        SupplierAvailabilityDto supplierInfo;
        if (supplierClient != null) {
            supplierInfo = supplierClient.checkSupplierAvailability(productId);
        } else {
            supplierInfo = new SupplierAvailabilityDto(productId, "Supplier Service Unavailable", 0, 0.0, false, "Supplier client unconfigured");
        }

        // 2. Currency Conversion (from Frankfurter API: EUR -> USD)
        CurrencyInfoDto currencyInfo;
        if (frankfurterClient != null) {
            currencyInfo = frankfurterClient.convertCurrency(product.getPrice(), "EUR", "USD");
        } else {
            currencyInfo = new CurrencyInfoDto("EUR", "USD", 0.0, product.getPrice(), "Frankfurter client unconfigured");
        }

        // 3. Weather Monitoring (from Open-Meteo API for distribution hub)
        WeatherInfoDto weatherInfo;
        if (openMeteoClient != null) {
            weatherInfo = openMeteoClient.getWarehouseWeather();
        } else {
            weatherInfo = new WeatherInfoDto("Warehouse Hub", 0.0, 0.0, "Unknown", "Open-Meteo client unconfigured");
        }

        return new ProductExternalInfoDto(
                true,
                "Product external information retrieved successfully",
                product,
                supplierInfo,
                currencyInfo,
                weatherInfo
        );
    }

    private ProductEntity toEntity(Product product) {
        return new ProductEntity(
                product.getId(),
                product.getName(),
                product.getQuantity(),
                product.getPrice(),
                product.getCategory()
        );
    }

    private Product toDto(ProductEntity entity) {
        Product product = new Product();
        product.setId(entity.getId());
        product.setName(entity.getName());
        product.setQuantity(entity.getQuantity());
        product.setPrice(entity.getPrice());
        product.setCategory(entity.getCategory());
        return product;
    }
}
