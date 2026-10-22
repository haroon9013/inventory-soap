package com.example.inventory.endpoint;

import com.example.inventory.dto.ProductExternalInfoDto;
import com.example.inventory.dto.SupplierAvailabilityDto;
import com.example.inventory.generated.AddProductRequest;
import com.example.inventory.generated.AddProductResponse;
import com.example.inventory.generated.AdjustStockRequest;
import com.example.inventory.generated.AdjustStockResponse;
import com.example.inventory.generated.CheckSupplierAvailabilityRequest;
import com.example.inventory.generated.CheckSupplierAvailabilityResponse;
import com.example.inventory.generated.CurrencyInfo;
import com.example.inventory.generated.DeleteProductRequest;
import com.example.inventory.generated.DeleteProductResponse;
import com.example.inventory.generated.GetAllProductsRequest;
import com.example.inventory.generated.GetAllProductsResponse;
import com.example.inventory.generated.GetProductExternalInfoRequest;
import com.example.inventory.generated.GetProductExternalInfoResponse;
import com.example.inventory.generated.GetProductRequest;
import com.example.inventory.generated.GetProductResponse;
import com.example.inventory.generated.GetStockMovementsRequest;
import com.example.inventory.generated.GetStockMovementsResponse;
import com.example.inventory.generated.GetWeatherAdvisoriesRequest;
import com.example.inventory.generated.GetWeatherAdvisoriesResponse;
import com.example.inventory.generated.Product;
import com.example.inventory.generated.StockMovement;
import com.example.inventory.generated.SupplierInfo;
import com.example.inventory.generated.UpdateProductRequest;
import com.example.inventory.generated.UpdateProductResponse;
import com.example.inventory.generated.WeatherInfo;
import com.example.inventory.service.InventoryService;
import org.springframework.ws.server.endpoint.annotation.Endpoint;
import org.springframework.ws.server.endpoint.annotation.PayloadRoot;
import org.springframework.ws.server.endpoint.annotation.RequestPayload;
import org.springframework.ws.server.endpoint.annotation.ResponsePayload;

import java.util.List;

@Endpoint
public class InventoryEndpoint {

    private static final String NAMESPACE = "http://example.com/inventory";

    private final InventoryService inventoryService;

    public InventoryEndpoint(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "GetAllProductsRequest")
    @ResponsePayload
    public GetAllProductsResponse getAllProducts(@RequestPayload GetAllProductsRequest request) {
        GetAllProductsResponse response = new GetAllProductsResponse();
        response.getProducts().addAll(inventoryService.getAllProducts());
        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "GetStockMovementsRequest")
    @ResponsePayload
    public GetStockMovementsResponse getStockMovements(@RequestPayload GetStockMovementsRequest request) {
        GetStockMovementsResponse response = new GetStockMovementsResponse();
        Integer productId = (request.getProductId() != null && request.getProductId() > 0) ? request.getProductId() : null;
        Integer maxRecords = (request.getMaxRecords() != null && request.getMaxRecords() > 0) ? request.getMaxRecords() : null;
        List<StockMovement> movements = inventoryService.getStockMovements(productId, maxRecords);
        response.getMovements().addAll(movements);
        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "AdjustStockRequest")
    @ResponsePayload
    public AdjustStockResponse adjustStock(@RequestPayload AdjustStockRequest request) {
        if (request == null) {
            AdjustStockResponse response = new AdjustStockResponse();
            response.setSuccess(false);
            response.setMessage("Invalid request: AdjustStockRequest cannot be null");
            return response;
        }

        try {
            return inventoryService.adjustStock(
                    request.getProductId(),
                    request.getQuantityChange(),
                    request.getTargetQuantity(),
                    request.getReason(),
                    request.getReference()
            );
        } catch (org.springframework.orm.ObjectOptimisticLockingFailureException | jakarta.persistence.OptimisticLockException e) {
            AdjustStockResponse response = new AdjustStockResponse();
            response.setSuccess(false);
            response.setMessage("Concurrency conflict: Product was modified by another transaction. Please refresh and retry.");
            response.setProductId(request.getProductId());
            return response;
        } catch (Exception e) {
            AdjustStockResponse response = new AdjustStockResponse();
            response.setSuccess(false);
            response.setMessage("Adjustment failed due to an unexpected server error");
            response.setProductId(request.getProductId());
            return response;
        }
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "AddProductRequest")
    @ResponsePayload
    public AddProductResponse addProduct(@RequestPayload AddProductRequest request) {
        AddProductResponse response = new AddProductResponse();
        if (request == null || request.getProduct() == null) {
            response.setSuccess(false);
            response.setMessage("Invalid request: Product details must be provided");
            return response;
        }

        Product product = request.getProduct();
        try {
            boolean added = inventoryService.addProduct(product);
            response.setSuccess(added);
            response.setMessage(
                    added
                            ? "Product added successfully"
                            : "Product with ID " + product.getId() + " already exists"
            );
        } catch (Exception e) {
            response.setSuccess(false);
            response.setMessage("Failed to add product due to an unexpected server error");
        }

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "GetProductRequest")
    @ResponsePayload
    public GetProductResponse getProduct(@RequestPayload GetProductRequest request) {
        GetProductResponse response = new GetProductResponse();
        if (request == null) {
            response.setSuccess(false);
            response.setMessage("Invalid request: GetProductRequest cannot be null");
            return response;
        }

        try {
            inventoryService.getProduct(request.getId()).ifPresentOrElse(
                    product -> {
                        response.setSuccess(true);
                        response.setMessage("Product found successfully");
                        response.setProduct(product);
                    },
                    () -> {
                        response.setSuccess(false);
                        response.setMessage(
                                "Product with ID " + request.getId() + " not found"
                        );
                    }
            );
        } catch (Exception e) {
            response.setSuccess(false);
            response.setMessage("Failed to retrieve product due to an unexpected server error");
        }

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "UpdateProductRequest")
    @ResponsePayload
    public UpdateProductResponse updateProduct(@RequestPayload UpdateProductRequest request) {
        UpdateProductResponse response = new UpdateProductResponse();
        if (request == null || request.getProduct() == null) {
            response.setSuccess(false);
            response.setMessage("Invalid request: Product details must be provided");
            return response;
        }

        Product product = request.getProduct();
        try {
            boolean updated = inventoryService.updateProduct(product);
            response.setSuccess(updated);
            response.setMessage(
                    updated
                            ? "Product updated successfully"
                            : "Product with ID " + product.getId() + " not found or concurrent modification detected"
            );
        } catch (Exception e) {
            response.setSuccess(false);
            response.setMessage("Failed to update product due to an unexpected server error");
        }

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "DeleteProductRequest")
    @ResponsePayload
    public DeleteProductResponse deleteProduct(@RequestPayload DeleteProductRequest request) {
        DeleteProductResponse response = new DeleteProductResponse();
        if (request == null) {
            response.setSuccess(false);
            response.setMessage("Invalid request: DeleteProductRequest cannot be null");
            return response;
        }

        try {
            boolean deleted = inventoryService.deleteProduct(request.getId());
            response.setSuccess(deleted);
            response.setMessage(
                    deleted
                            ? "Product deleted successfully"
                            : "Product with ID " + request.getId() + " not found"
            );
        } catch (Exception e) {
            response.setSuccess(false);
            response.setMessage("Failed to delete product due to an unexpected server error");
        }

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "CheckSupplierAvailabilityRequest")
    @ResponsePayload
    public CheckSupplierAvailabilityResponse checkSupplierAvailability(
            @RequestPayload CheckSupplierAvailabilityRequest request) {

        SupplierAvailabilityDto dto = inventoryService.checkSupplierAvailability(request.getProductId());

        CheckSupplierAvailabilityResponse response = new CheckSupplierAvailabilityResponse();
        response.setProductId(dto.getProductId());
        response.setSupplierName(dto.getSupplierName());
        response.setAvailableQuantity(dto.getAvailableQuantity());
        response.setSupplierPrice(dto.getSupplierPrice());
        response.setAvailable(dto.isAvailable());

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "GetProductExternalInfoRequest")
    @ResponsePayload
    public GetProductExternalInfoResponse getProductExternalInfo(
            @RequestPayload GetProductExternalInfoRequest request) {

        ProductExternalInfoDto dto = inventoryService.getProductExternalInfo(request.getId());

        GetProductExternalInfoResponse response = new GetProductExternalInfoResponse();
        response.setSuccess(dto.isSuccess());
        response.setMessage(dto.getMessage());

        if (dto.getProduct() != null) {
            response.setProduct(dto.getProduct());
        }

        if (dto.getSupplierInfo() != null) {
            SupplierInfo sInfo = new SupplierInfo();
            sInfo.setSupplierName(dto.getSupplierInfo().getSupplierName());
            sInfo.setAvailableQuantity(dto.getSupplierInfo().getAvailableQuantity());
            sInfo.setSupplierPrice(dto.getSupplierInfo().getSupplierPrice());
            sInfo.setAvailable(dto.getSupplierInfo().isAvailable());
            sInfo.setStatus(dto.getSupplierInfo().getMessage() != null ? dto.getSupplierInfo().getMessage() : "OK");
            response.setSupplierInfo(sInfo);
        }

        if (dto.getCurrencyInfo() != null) {
            CurrencyInfo cInfo = new CurrencyInfo();
            cInfo.setBaseCurrency(dto.getCurrencyInfo().getBaseCurrency());
            cInfo.setTargetCurrency(dto.getCurrencyInfo().getTargetCurrency());
            cInfo.setExchangeRate(dto.getCurrencyInfo().getExchangeRate());
            cInfo.setConvertedPrice(dto.getCurrencyInfo().getConvertedPrice());
            cInfo.setStatus(dto.getCurrencyInfo().getStatus());
            response.setCurrencyInfo(cInfo);
        }

        if (dto.getWeatherInfo() != null) {
            WeatherInfo wInfo = new WeatherInfo();
            wInfo.setLocation(dto.getWeatherInfo().getLocation());
            wInfo.setTemperature(dto.getWeatherInfo().getTemperature());
            wInfo.setWindSpeed(dto.getWeatherInfo().getWindSpeed());
            wInfo.setWeatherCondition(dto.getWeatherInfo().getWeatherCondition());
            wInfo.setStatus(dto.getWeatherInfo().getStatus());
            response.setWeatherInfo(wInfo);
        }

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "GetWeatherAdvisoriesRequest")
    @ResponsePayload
    public GetWeatherAdvisoriesResponse getWeatherAdvisories(@RequestPayload GetWeatherAdvisoriesRequest request) {
        Integer horizon = (request != null) ? request.getMaxHorizonHours() : null;
        return inventoryService.getWeatherAdvisories(horizon, false);
    }
}