package com.example.inventory.endpoint;

import com.example.inventory.dto.ProductExternalInfoDto;
import com.example.inventory.dto.SupplierAvailabilityDto;
import com.example.inventory.generated.AddProductRequest;
import com.example.inventory.generated.AddProductResponse;
import com.example.inventory.generated.CheckSupplierAvailabilityRequest;
import com.example.inventory.generated.CheckSupplierAvailabilityResponse;
import com.example.inventory.generated.CurrencyInfo;
import com.example.inventory.generated.DeleteProductRequest;
import com.example.inventory.generated.DeleteProductResponse;
import com.example.inventory.generated.GetProductExternalInfoRequest;
import com.example.inventory.generated.GetProductExternalInfoResponse;
import com.example.inventory.generated.GetProductRequest;
import com.example.inventory.generated.GetProductResponse;
import com.example.inventory.generated.Product;
import com.example.inventory.generated.SupplierInfo;
import com.example.inventory.generated.UpdateProductRequest;
import com.example.inventory.generated.UpdateProductResponse;
import com.example.inventory.generated.WeatherInfo;
import com.example.inventory.generated.DeleteProductRequest;
import com.example.inventory.generated.DeleteProductResponse;
import com.example.inventory.generated.GetProductRequest;
import com.example.inventory.generated.GetProductResponse;
import com.example.inventory.generated.Product;
import com.example.inventory.generated.UpdateProductRequest;
import com.example.inventory.generated.UpdateProductResponse;
import com.example.inventory.service.InventoryService;
import org.springframework.ws.server.endpoint.annotation.Endpoint;
import org.springframework.ws.server.endpoint.annotation.PayloadRoot;
import org.springframework.ws.server.endpoint.annotation.RequestPayload;
import org.springframework.ws.server.endpoint.annotation.ResponsePayload;

@Endpoint
public class InventoryEndpoint {

    private static final String NAMESPACE = "http://example.com/inventory";

    private final InventoryService inventoryService;

    public InventoryEndpoint(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "AddProductRequest")
    @ResponsePayload
    public AddProductResponse addProduct(@RequestPayload AddProductRequest request) {

        Product product = request.getProduct();

        boolean added = inventoryService.addProduct(product);

        AddProductResponse response = new AddProductResponse();
        response.setSuccess(added);
        response.setMessage(
                added
                        ? "Product added successfully"
                        : "Product with ID " + product.getId() + " already exists"
        );

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "GetProductRequest")
    @ResponsePayload
    public GetProductResponse getProduct(@RequestPayload GetProductRequest request) {

        GetProductResponse response = new GetProductResponse();

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

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "UpdateProductRequest")
    @ResponsePayload
    public UpdateProductResponse updateProduct(
            @RequestPayload UpdateProductRequest request) {

        Product product = request.getProduct();

        boolean updated = inventoryService.updateProduct(product);

        UpdateProductResponse response = new UpdateProductResponse();
        response.setSuccess(updated);
        response.setMessage(
                updated
                        ? "Product updated successfully"
                        : "Product with ID " + product.getId() + " not found"
        );

        return response;
    }

    @PayloadRoot(namespace = NAMESPACE, localPart = "DeleteProductRequest")
    @ResponsePayload
    public DeleteProductResponse deleteProduct(
            @RequestPayload DeleteProductRequest request) {

        boolean deleted = inventoryService.deleteProduct(request.getId());

        DeleteProductResponse response = new DeleteProductResponse();
        response.setSuccess(deleted);
        response.setMessage(
                deleted
                        ? "Product deleted successfully"
                        : "Product with ID " + request.getId() + " not found"
        );

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
}