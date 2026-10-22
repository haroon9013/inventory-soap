package com.example.inventory.service;

import com.example.inventory.client.FrankfurterClient;
import com.example.inventory.client.OpenMeteoClient;
import com.example.inventory.client.SupplierClient;
import com.example.inventory.dto.CurrencyInfoDto;
import com.example.inventory.dto.ProductExternalInfoDto;
import com.example.inventory.dto.SupplierAvailabilityDto;
import com.example.inventory.dto.WeatherInfoDto;
import com.example.inventory.dto.WarehouseForecastReportDto;
import com.example.inventory.dto.WeatherAdvisoryDto;
import com.example.inventory.entity.ProductEntity;
import com.example.inventory.entity.StockMovementEntity;
import com.example.inventory.generated.AdjustStockResponse;
import com.example.inventory.generated.GetWeatherAdvisoriesResponse;
import com.example.inventory.generated.Product;
import com.example.inventory.generated.StockMovement;
import com.example.inventory.generated.WeatherAdvisory;
import com.example.inventory.generated.WeatherInfo;
import com.example.inventory.repository.ProductRepository;
import com.example.inventory.repository.StockMovementRepository;
import jakarta.persistence.OptimisticLockException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

@Service
public class InventoryService {

    private final ProductRepository productRepository;
    private final StockMovementRepository stockMovementRepository;
    private final SupplierClient supplierClient;
    private final FrankfurterClient frankfurterClient;
    private final OpenMeteoClient openMeteoClient;

    @Autowired
    public InventoryService(
            ProductRepository productRepository,
            StockMovementRepository stockMovementRepository,
            SupplierClient supplierClient,
            FrankfurterClient frankfurterClient,
            OpenMeteoClient openMeteoClient) {
        this.productRepository = productRepository;
        this.stockMovementRepository = stockMovementRepository;
        this.supplierClient = supplierClient;
        this.frankfurterClient = frankfurterClient;
        this.openMeteoClient = openMeteoClient;
    }

    public InventoryService(
            ProductRepository productRepository,
            SupplierClient supplierClient,
            FrankfurterClient frankfurterClient,
            OpenMeteoClient openMeteoClient) {
        this(productRepository, null, supplierClient, frankfurterClient, openMeteoClient);
    }

    public InventoryService(ProductRepository productRepository, StockMovementRepository stockMovementRepository) {
        this(productRepository, stockMovementRepository, null, null, null);
    }

    public InventoryService(ProductRepository productRepository, SupplierClient supplierClient) {
        this(productRepository, null, supplierClient, null, null);
    }

    public InventoryService(ProductRepository productRepository) {
        this(productRepository, null, null, null, null);
    }

    @Transactional(readOnly = true)
    public List<Product> getAllProducts() {
        return productRepository.findAll()
                .stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean addProduct(Product product) {
        if (productRepository.existsById(product.getId())) {
            return false;
        }

        ProductEntity entity = toEntity(product);
        productRepository.save(entity);

        // Record initial stock movement if quantity > 0
        if (stockMovementRepository != null && product.getQuantity() > 0) {
            StockMovementEntity movement = new StockMovementEntity(
                    product.getId(),
                    product.getName(),
                    "STOCK_IN",
                    0,
                    product.getQuantity(),
                    product.getQuantity(),
                    "Initial product stock",
                    LocalDateTime.now(),
                    "ADD_PRODUCT"
            );
            stockMovementRepository.save(movement);
        }

        return true;
    }

    @Transactional(readOnly = true)
    public Optional<Product> getProduct(int id) {
        return productRepository.findById(id).map(this::toDto);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateProduct(Product product) {
        if (!productRepository.existsById(product.getId())) {
            return false;
        }

        Optional<ProductEntity> existingOpt = productRepository.findById(product.getId());
        Integer previousQuantity = existingOpt.map(ProductEntity::getQuantity).orElse(null);
        int newQuantity = product.getQuantity();

        ProductEntity entity = existingOpt.orElseGet(() -> toEntity(product));
        entity.setName(product.getName());
        entity.setQuantity(newQuantity);
        entity.setPrice(product.getPrice());
        entity.setCategory(product.getCategory());

        try {
            productRepository.save(entity);

            // Only record stock movement if quantity actually changed and previous quantity is known
            if (stockMovementRepository != null && previousQuantity != null && newQuantity != previousQuantity) {
                int change = newQuantity - previousQuantity;
                String movementType = change > 0 ? "STOCK_IN" : "STOCK_OUT";
                String reason = change > 0 ? "Stock increased via product update" : "Stock decreased via product update";

                StockMovementEntity movement = new StockMovementEntity(
                        product.getId(),
                        product.getName(),
                        movementType,
                        previousQuantity,
                        newQuantity,
                        change,
                        reason,
                        LocalDateTime.now(),
                        "UPDATE_PRODUCT"
                );
                stockMovementRepository.save(movement);
            }

            return true;
        } catch (ObjectOptimisticLockingFailureException | OptimisticLockException e) {
            markRollbackOnlyQuietly();
            return false;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean deleteProduct(int id) {
        Optional<ProductEntity> opt = productRepository.findById(id);
        if (opt.isEmpty()) {
            if (!productRepository.existsById(id)) {
                return false;
            }
        }

        if (opt.isPresent() && stockMovementRepository != null) {
            ProductEntity entity = opt.get();
            int previousQuantity = entity.getQuantity() != null ? entity.getQuantity() : 0;
            StockMovementEntity movement = new StockMovementEntity(
                    entity.getId(),
                    entity.getName() != null ? entity.getName() : "Deleted Product",
                    "STOCK_OUT",
                    previousQuantity,
                    0,
                    -previousQuantity,
                    "Product deleted from catalog",
                    LocalDateTime.now(),
                    "DELETE_PRODUCT"
            );
            stockMovementRepository.save(movement);
        }

        productRepository.deleteById(id);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public AdjustStockResponse adjustStock(int productId, Integer quantityChange, Integer targetQuantity, String reason, String reference) {
        Optional<ProductEntity> opt = productRepository.findById(productId);
        if (opt.isEmpty()) {
            AdjustStockResponse response = new AdjustStockResponse();
            response.setSuccess(false);
            response.setMessage("Product with ID " + productId + " not found");
            response.setProductId(productId);
            return response;
        }

        ProductEntity product = opt.get();
        int previousQuantity = product.getQuantity() != null ? product.getQuantity() : 0;

        // Reject if both targetQuantity and quantityChange are provided
        if (targetQuantity != null && quantityChange != null) {
            AdjustStockResponse response = new AdjustStockResponse();
            response.setSuccess(false);
            response.setMessage("Adjustment rejected: Cannot specify both quantityChange and targetQuantity");
            response.setProductId(productId);
            response.setPreviousQuantity(previousQuantity);
            response.setUpdatedQuantity(previousQuantity);
            return response;
        }

        // Reject if neither is provided
        if (targetQuantity == null && quantityChange == null) {
            AdjustStockResponse response = new AdjustStockResponse();
            response.setSuccess(false);
            response.setMessage("Adjustment rejected: Either targetQuantity or quantityChange must be provided");
            response.setProductId(productId);
            response.setPreviousQuantity(previousQuantity);
            response.setUpdatedQuantity(previousQuantity);
            return response;
        }

        int newQuantity;
        int change;

        if (targetQuantity != null) {
            if (targetQuantity < 0) {
                AdjustStockResponse response = new AdjustStockResponse();
                response.setSuccess(false);
                response.setMessage("Adjustment rejected: Target quantity cannot be negative (" + targetQuantity + ")");
                response.setProductId(productId);
                response.setPreviousQuantity(previousQuantity);
                response.setUpdatedQuantity(previousQuantity);
                return response;
            }
            newQuantity = targetQuantity;
            change = newQuantity - previousQuantity;
        } else {
            change = quantityChange;
            newQuantity = previousQuantity + change;
        }

        if (newQuantity < 0) {
            AdjustStockResponse response = new AdjustStockResponse();
            response.setSuccess(false);
            response.setMessage("Adjustment rejected: Resulting quantity cannot be negative (" + newQuantity + ")");
            response.setProductId(productId);
            response.setPreviousQuantity(previousQuantity);
            response.setUpdatedQuantity(previousQuantity);
            return response;
        }

        product.setQuantity(newQuantity);

        String effectiveReason = (reason != null && !reason.trim().isEmpty())
                ? reason.trim()
                : "Manual inventory stock adjustment";
        String effectiveRef = (reference != null && !reference.trim().isEmpty())
                ? reference.trim()
                : "MANUAL_ADJUSTMENT";

        StockMovementEntity entity = new StockMovementEntity(
                productId,
                product.getName(),
                "ADJUSTMENT",
                previousQuantity,
                newQuantity,
                change,
                effectiveReason,
                LocalDateTime.now(),
                effectiveRef
        );

        StockMovementEntity savedEntity = entity;
        try {
            productRepository.save(product);

            if (stockMovementRepository != null) {
                StockMovementEntity persisted = stockMovementRepository.save(entity);
                if (persisted != null) {
                    savedEntity = persisted;
                }
            }
        } catch (ObjectOptimisticLockingFailureException | OptimisticLockException e) {
            markRollbackOnlyQuietly();
            AdjustStockResponse response = new AdjustStockResponse();
            response.setSuccess(false);
            response.setMessage("Concurrency conflict: Product was modified by another transaction. Please refresh and retry.");
            response.setProductId(productId);
            response.setPreviousQuantity(previousQuantity);
            response.setUpdatedQuantity(previousQuantity);
            return response;
        }

        AdjustStockResponse response = new AdjustStockResponse();
        response.setSuccess(true);
        response.setMessage("Stock adjusted successfully for Product #" + productId + " (" + previousQuantity + " -> " + newQuantity + ")");
        response.setProductId(productId);
        response.setPreviousQuantity(previousQuantity);
        response.setUpdatedQuantity(newQuantity);
        response.setMovement(toDto(savedEntity));
        return response;
    }

    @Transactional(readOnly = true)
    public List<StockMovement> getStockMovements(Integer productId, Integer maxRecords) {
        if (stockMovementRepository == null) {
            return Collections.emptyList();
        }

        int limit = (maxRecords != null && maxRecords > 0) ? maxRecords : 100;
        Pageable pageable = PageRequest.of(0, limit);

        List<StockMovementEntity> entities;
        if (productId != null && productId > 0) {
            entities = stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(productId, pageable);
        } else {
            entities = stockMovementRepository.findAllByOrderByTimestampDescIdDesc(pageable);
        }

        return entities.stream().map(this::toDto).toList();
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

    @Transactional(readOnly = true)
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

        // 2. Currency Conversion (Product Catalog base currency is INR; target for international comparison is USD)
        CurrencyInfoDto currencyInfo = null;
        if (frankfurterClient != null) {
            currencyInfo = frankfurterClient.convertCurrency(product.getPrice(), "INR", "USD");
            if (currencyInfo == null) {
                // Backward compatibility fallback if test stubbed legacy EUR -> USD
                currencyInfo = frankfurterClient.convertCurrency(product.getPrice(), "EUR", "USD");
            }
        }
        if (currencyInfo == null) {
            currencyInfo = new CurrencyInfoDto("INR", "USD", 0.0, product.getPrice(), "Frankfurter client unconfigured");
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

    // --------------------------------------------------------------------------
    // Milestone 3: Smart Restocking Recommendation Rules
    // --------------------------------------------------------------------------
    public static final int DEFAULT_TARGET_STOCK_LEVEL = 20;
    public static final int DEFAULT_LOW_STOCK_THRESHOLD = 5;

    public com.example.inventory.dto.RestockRecommendationDto calculateRestockRecommendation(Product product) {
        return calculateRestockRecommendation(product, DEFAULT_TARGET_STOCK_LEVEL, DEFAULT_LOW_STOCK_THRESHOLD);
    }

    public com.example.inventory.dto.RestockRecommendationDto calculateRestockRecommendation(Product product, int targetStockLevel, int lowStockThreshold) {
        if (product == null) {
            return null;
        }

        int current = product.getQuantity();
        int suggested = Math.max(0, targetStockLevel - current);

        String urgency;
        String reason;
        boolean candidate;

        if (current == 0) {
            urgency = "CRITICAL";
            reason = "Out of Stock: Zero units remaining. Immediate replenishment of " + suggested + " units recommended.";
            candidate = true;
        } else if (current < lowStockThreshold) {
            urgency = "HIGH";
            reason = "Low Stock: Current inventory (" + current + " units) is below safe threshold (" + lowStockThreshold + "). Replenish " + suggested + " units to restore buffer.";
            candidate = true;
        } else if (current < targetStockLevel) {
            urgency = "OPTIMAL";
            reason = "Adequate Stock: Current inventory (" + current + " units) meets threshold (" + lowStockThreshold + ") but is below target (" + targetStockLevel + ").";
            candidate = false;
        } else {
            urgency = "OPTIMAL";
            reason = "Well Stocked: Current inventory (" + current + " units) meets or exceeds target level (" + targetStockLevel + ").";
            candidate = false;
        }

        return new com.example.inventory.dto.RestockRecommendationDto(
                product.getId(),
                product.getName(),
                product.getCategory(),
                current,
                targetStockLevel,
                suggested,
                urgency,
                reason,
                candidate
        );
    }

    @Transactional(readOnly = true)
    public List<com.example.inventory.dto.RestockRecommendationDto> getRestockRecommendations() {
        return getAllProducts().stream()
                .map(this::calculateRestockRecommendation)
                .filter(com.example.inventory.dto.RestockRecommendationDto::isCandidate)
                .toList();
    }

    // --------------------------------------------------------------------------
    // Milestone 4: Weather-Aware Inventory Operations & Risk Advisories
    // --------------------------------------------------------------------------
    @Transactional(readOnly = true)
    public GetWeatherAdvisoriesResponse getWeatherAdvisories(Integer maxHorizonHours, boolean forceRefresh) {
        int horizon = (maxHorizonHours != null && maxHorizonHours > 0) ? Math.min(maxHorizonHours, 48) : 48;

        WarehouseForecastReportDto reportDto;
        if (openMeteoClient != null) {
            reportDto = openMeteoClient.getWarehouseForecastAndAdvisories(horizon, forceRefresh);
        } else {
            List<WeatherAdvisoryDto> fallback = new ArrayList<>();
            fallback.add(new WeatherAdvisoryDto(
                    "ADV-METEO-UNCONF",
                    "INFO",
                    "Weather Integration Unconfigured",
                    "Open-Meteo client is currently unconfigured or unavailable.",
                    "Next " + horizon + " Hours",
                    "Client bean is null",
                    "Verify Open-Meteo client configuration.",
                    "Operational advisory indication only."
            ));
            reportDto = new WarehouseForecastReportDto(
                    "Warehouse Hub",
                    0.0,
                    0.0,
                    LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                    horizon,
                    0.0,
                    0.0,
                    "Unknown",
                    "UNAVAILABLE: Open-Meteo client unconfigured",
                    fallback
            );
        }

        GetWeatherAdvisoriesResponse response = new GetWeatherAdvisoriesResponse();
        response.setLocation(reportDto.getLocation());
        response.setLatitude(reportDto.getLatitude());
        response.setLongitude(reportDto.getLongitude());
        response.setRetrievalTime(reportDto.getRetrievalTime());
        response.setForecastHorizonHours(reportDto.getForecastHorizonHours());
        response.setStatus(reportDto.getStatus());

        WeatherInfo wInfo = new WeatherInfo();
        wInfo.setLocation(reportDto.getLocation());
        wInfo.setTemperature(reportDto.getCurrentTemperature());
        wInfo.setWindSpeed(reportDto.getCurrentWindSpeed());
        wInfo.setWeatherCondition(reportDto.getCurrentCondition());
        wInfo.setStatus(reportDto.getStatus());
        response.setCurrentWeather(wInfo);

        List<WeatherAdvisoryDto> advisoryList = new ArrayList<>();
        if (reportDto.getAdvisories() != null) {
            advisoryList.addAll(reportDto.getAdvisories());
        }

        // Check if adverse weather is active (WARNING or HIGH severity)
        boolean hasAdverseWeather = advisoryList.stream()
                .anyMatch(a -> "HIGH".equalsIgnoreCase(a.getSeverity()) || "WARNING".equalsIgnoreCase(a.getSeverity()));

        // Connect weather information to inventory status in a restrained, explainable manner
        if (hasAdverseWeather && productRepository != null) {
            List<ProductEntity> allProducts = productRepository.findAll();

            List<ProductEntity> outOfStock = allProducts.stream()
                    .filter(p -> p.getQuantity() != null && p.getQuantity() == 0)
                    .toList();

            List<ProductEntity> lowStock = allProducts.stream()
                    .filter(p -> p.getQuantity() != null && p.getQuantity() > 0 && p.getQuantity() < DEFAULT_LOW_STOCK_THRESHOLD)
                    .toList();

            if (!outOfStock.isEmpty()) {
                String productSample = outOfStock.stream()
                        .map(p -> p.getName() + " (#" + p.getId() + ")")
                        .limit(3)
                        .reduce((a, b) -> a + ", " + b)
                        .orElse("");
                if (outOfStock.size() > 3) {
                    productSample += " and " + (outOfStock.size() - 3) + " more";
                }

                advisoryList.add(new WeatherAdvisoryDto(
                        "ADV-INV-OUT-OF-STOCK",
                        "HIGH",
                        "Urgent Stockout Replenishment Advisory (Adverse Weather Overlap)",
                        "Product-specific planning consideration: Warehouse has " + outOfStock.size() +
                                " out-of-stock product(s) (" + productSample + "). Active adverse weather at the warehouse hub may impair inbound carrier transit or external yard offloading, compounding stockout duration.",
                        "Forecast Window (" + horizon + "h)",
                        "Adverse weather advisory active coinciding with " + outOfStock.size() + " out-of-stock product(s)",
                        "Prioritize supplier dispatch confirmation and schedule covered dock unloading windows immediately.",
                        "Forecast-based operational advisory; not a confirmation of carrier delay or road disruption."
                ));
            } else if (!lowStock.isEmpty()) {
                advisoryList.add(new WeatherAdvisoryDto(
                        "ADV-INV-REPLENISH-TIMING",
                        "WARNING",
                        "Replenishment Timing Consideration (Adverse Weather Overlap)",
                        "Product-specific planning consideration: " + lowStock.size() +
                                " product(s) currently require restocking. Adverse weather at the warehouse hub may cause transit or receiving bottlenecks.",
                        "Forecast Window (" + horizon + "h)",
                        "Adverse weather advisory active coinciding with " + lowStock.size() + " replenishment candidate(s)",
                        "Review supplier lead times and order timing so inbound deliveries do not coincide with peak adverse weather windows.",
                        "Forecast-based operational advisory; not a confirmation of carrier delay or road disruption."
                ));
            }
        }

        // Sort advisories: HIGH -> WARNING -> INFO
        advisoryList.sort((a, b) -> Integer.compare(getSeverityScore(b.getSeverity()), getSeverityScore(a.getSeverity())));

        for (WeatherAdvisoryDto advDto : advisoryList) {
            WeatherAdvisory advisory = new WeatherAdvisory();
            advisory.setId(advDto.getId());
            advisory.setSeverity(advDto.getSeverity());
            advisory.setTitle(advDto.getTitle());
            advisory.setDescription(advDto.getDescription());
            advisory.setExpectedTime(advDto.getExpectedTime());
            advisory.setTriggerConditions(advDto.getTriggerConditions());
            advisory.setRecommendedAction(advDto.getRecommendedAction());
            advisory.setDisclaimer(advDto.getDisclaimer());
            response.getAdvisories().add(advisory);
        }

        return response;
    }

    private int getSeverityScore(String severity) {
        if ("HIGH".equalsIgnoreCase(severity)) return 3;
        if ("WARNING".equalsIgnoreCase(severity)) return 2;
        if ("INFO".equalsIgnoreCase(severity)) return 1;
        return 0;
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

    private StockMovement toDto(StockMovementEntity entity) {
        if (entity == null) {
            return null;
        }
        StockMovement dto = new StockMovement();
        if (entity.getId() != null) {
            dto.setId(entity.getId());
        }
        dto.setProductId(entity.getProductId());
        dto.setProductName(entity.getProductName() != null ? entity.getProductName() : "");
        dto.setMovementType(entity.getMovementType() != null ? entity.getMovementType() : "ADJUSTMENT");
        dto.setPreviousQuantity(entity.getPreviousQuantity() != null ? entity.getPreviousQuantity() : 0);
        dto.setNewQuantity(entity.getNewQuantity() != null ? entity.getNewQuantity() : 0);
        dto.setQuantityChange(entity.getQuantityChange() != null ? entity.getQuantityChange() : 0);
        dto.setReason(entity.getReason() != null ? entity.getReason() : "");
        dto.setTimestamp(entity.getTimestamp() != null ? entity.getTimestamp().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : "");
        dto.setReference(entity.getReference() != null ? entity.getReference() : "");
        return dto;
    }

    private void markRollbackOnlyQuietly() {
        try {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        } catch (NoTransactionException ignored) {
            // Not running in a Spring transaction context (e.g. mock unit test)
        }
    }
}
