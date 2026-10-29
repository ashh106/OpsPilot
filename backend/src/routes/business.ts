import { Router } from "express";
import { BusinessController } from "../controllers/business.controller.js";
import { AppointmentController } from "../controllers/appointment.controller.js";
import { ProductController } from "../controllers/product.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const businessRouter = Router();

// All business routes require authenticated owner
businessRouter.use(requireAuth);

businessRouter.post("/", BusinessController.create);
businessRouter.get("/", BusinessController.listMine);
businessRouter.get("/:id", BusinessController.getById);
businessRouter.patch("/:id", BusinessController.update);

// Services nested routes
businessRouter.post("/:id/services", BusinessController.createService);
businessRouter.get("/:id/services", BusinessController.getServices);
businessRouter.patch("/:id/services/:serviceId", BusinessController.updateService);

// Operating hours nested routes
businessRouter.get("/:id/hours", BusinessController.getHours);
businessRouter.put("/:id/hours", BusinessController.setHours);

// Appointments nested routes
businessRouter.get("/:id/appointments/availability", AppointmentController.getAvailability);
businessRouter.get("/:id/appointments", AppointmentController.list);
businessRouter.post("/:id/appointments", AppointmentController.create);
businessRouter.get("/:id/appointments/:appointmentId", AppointmentController.getById);
businessRouter.patch("/:id/appointments/:appointmentId", AppointmentController.reschedule);
businessRouter.post("/:id/appointments/:appointmentId/cancel", AppointmentController.cancel);

// Customers nested routes
businessRouter.get("/:id/customers", AppointmentController.listCustomers);

// Products and Inventory nested routes
businessRouter.get("/:id/products/summary", ProductController.getSummary);
businessRouter.get("/:id/products/audits", ProductController.getAudits);
businessRouter.get("/:id/products", ProductController.listProducts);
businessRouter.post("/:id/products", ProductController.createProduct);
businessRouter.get("/:id/products/:productId", ProductController.getProduct);
businessRouter.patch("/:id/products/:productId/price", ProductController.updatePrice);
businessRouter.post("/:id/products/:productId/stock", ProductController.adjustStock);
businessRouter.get("/:id/products/:productId/audits", ProductController.getAudits);
