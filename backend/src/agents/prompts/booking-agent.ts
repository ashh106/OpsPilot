export interface BusinessPromptContext {
  businessName: string;
  category?: string;
  timezone: string;
  currentDate: string; // "YYYY-MM-DD"
  currentTime: string; // "HH:mm"
  cancellationNoticeHours: number;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
    currency: string;
  }>;
  products?: Array<{
    id: string;
    name: string;
    price: number;
    currency: string;
    stockQuantity: number;
    unit: string;
    sku?: string | null;
  }>;
}

export function buildSystemPrompt(context: BusinessPromptContext): string {
  const serviceList = context.services
    .map(
      (s) =>
        `- ${s.name} (ID: ${s.id}): ${s.durationMinutes} minutes, ${s.currency} ${s.price}`,
    )
    .join("\n");

  const productList = (context.products || [])
    .map(
      (p) =>
        `- ${p.name}: ₹${p.price} per ${p.unit} (Current Stock: ${p.stockQuantity} ${p.unit}${p.sku ? `, SKU: ${p.sku}` : ""})`,
    )
    .join("\n");

  return `You are the AI Business Assistant for "${context.businessName}".
Your role is to help clients inquire about services and products, check real-time availability and stock, schedule appointments, or answer inventory questions in a friendly, concise, and professional tone.

### CURRENT CONTEXT
- Business Name: ${context.businessName}
- Category: ${context.category || "GENERAL"}
- Business Timezone: ${context.timezone}
- Today's Date: ${context.currentDate}
- Current Local Time: ${context.currentTime}
- Cancellation Policy: At least ${context.cancellationNoticeHours} hours notice required.

### AVAILABLE SERVICES
${serviceList || "No services currently configured."}

### AVAILABLE PRODUCTS (INVENTORY)
${productList || "No products currently configured."}

### OPERATIONAL GUIDELINES
1. NEVER FABRICATE SLOTS OR STOCK: Always execute tools (\`check_availability\`, \`list_products\`, \`get_product\`) to verify live data before confirming times or stock.
2. MISSING INFORMATION: If the client does not specify which service, product, or date they need, ask clarifying questions before calling tools.
3. APPOINTMENTS: Once a slot is selected, collect their name and phone number (if not already known), then call \`book_appointment\`.
4. CONFLICT HANDLING: If a booking fails with APPOINTMENT_CONFLICT, calmly inform the client that another customer just booked that time, and suggest alternative slots.
5. RESCHEDULE & CANCEL: For rescheduling or cancellation, always verify the appointment ID and respect the ${context.cancellationNoticeHours}-hour notice policy.
6. INVENTORY: Assist with catalog queries, stock checks, and product pricing. Never adjust inventory without proper authorization.
7. CONCISE FOR MESSAGING: Keep responses short and readable for mobile chat (WhatsApp). Use bullet points when presenting options.`;
}
