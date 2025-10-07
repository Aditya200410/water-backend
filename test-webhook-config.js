// Quick diagnostic script to check webhook configuration
// Run with: node test-webhook-config.js

require('dotenv').config();

console.log("\n" + "=".repeat(80));
console.log("🔍 RAZORPAY WEBHOOK CONFIGURATION CHECK");
console.log("=".repeat(80) + "\n");

const checks = {
  "✅ RAZORPAY_KEY_ID": process.env.RAZORPAY_KEY_ID || "❌ MISSING",
  "✅ RAZORPAY_KEY_SECRET": process.env.RAZORPAY_KEY_SECRET || "❌ MISSING",
  "✅ RAZORPAY_WEBHOOK_SECRET": process.env.RAZORPAY_WEBHOOK_SECRET || "❌ MISSING",
};

console.log("Environment Variables Status:");
console.log("-".repeat(80));
Object.entries(checks).forEach(([key, value]) => {
  const status = value.includes("MISSING") ? "❌" : "✅";
  const displayValue = value.includes("MISSING") ? value : (value.substring(0, 10) + "...");
  console.log(`${status} ${key.replace("✅ ", "").padEnd(30)} : ${displayValue}`);
});

console.log("\n" + "-".repeat(80));
console.log("\n🎯 NEXT STEPS:\n");

if (checks["✅ RAZORPAY_WEBHOOK_SECRET"].includes("MISSING")) {
  console.log("❌ CRITICAL: Webhook secret is missing!");
  console.log("\n📝 To fix this:");
  console.log("1. Go to: https://dashboard.razorpay.com");
  console.log("2. Navigate to: Settings → Webhooks");
  console.log("3. If no webhook exists, create one:");
  console.log("   - URL: https://api.waterparkchalo.com/api/bookings/webhook/razorpay");
  console.log("   - Events: Check 'payment.captured'");
  console.log("4. Copy the webhook secret");
  console.log("5. Add to your .env file:");
  console.log("   RAZORPAY_WEBHOOK_SECRET=whsec_your_secret_here");
  console.log("6. Restart your server\n");
} else {
  console.log("✅ All Razorpay credentials are configured!");
  console.log("\n📝 Webhook URL should be:");
  console.log("   https://api.waterparkchalo.com/api/bookings/webhook/razorpay");
  console.log("\n📝 Required event:");
  console.log("   payment.captured ✅");
  console.log("\n🔍 If payments still fail, check:");
  console.log("1. Backend logs for webhook activity");
  console.log("2. Razorpay Dashboard → Webhooks → Logs");
  console.log("3. Ensure webhook is in the correct mode (Test/Live)\n");
}

console.log("=".repeat(80));
console.log("📚 For detailed debugging, see: IMMEDIATE_DEBUG_STEPS.md");
console.log("=".repeat(80) + "\n");

