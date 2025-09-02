const DataPage = require('../models/DataPage');

// Get all data pages
const dataPageController = async (req, res) => {
  try {
    console.log('Fetching all data pages...');
    const pages = await DataPage.find();
    console.log('Found pages:', pages);
    res.json(pages);
  } catch (err) {
    console.error('Error fetching data pages:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get data page by type
exports.getDataPageByType = async (req, res) => {
  try {
    const { type } = req.params;
    const page = await DataPage.findOne({ type });
    if (!page) return res.status(404).json({ error: 'Not found' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add new data page
exports.addDataPage = async (req, res) => {
  try {
    const { type, heading, content } = req.body;
    const exists = await DataPage.findOne({ type });
    if (exists) return res.status(400).json({ error: 'Type already exists' });
    const page = new DataPage({ type, heading, content });
    await page.save();
    res.status(201).json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update data page by type
exports.updateDataPage = async (req, res) => {
  try {
    const { type } = req.params;
    const { heading, content } = req.body;
    const page = await DataPage.findOneAndUpdate(
      { type },
      { heading, content },
      { new: true }
    );
    if (!page) return res.status(404).json({ error: 'Not found' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all data pages
exports.getAllDataPages = dataPageController;

// Initialize default policies data
exports.initializePolicies = async (req, res) => {
  try {
    console.log('Initializing default policies...');
    
     const defaultPolicies = [
  {
    _id: { $oid: "68b2aefd826e06e00bf57a2c" },
    type: "terms",
    heading: "Terms and Conditions",
    content: `Terms and Conditions:
Welcome to Water Park chalo. By accessing our website or purchasing a ticket, you agree to these terms and conditions.

Acceptance of Terms:
By using our services, you acknowledge that you have read, understood, and agree to be bound by these terms.

Park Information & Hours:
We strive to provide accurate information on park hours and ride availability, but these are subject to change without notice due to maintenance or weather.

Pricing and Payment:
All ticket prices are subject to change without notice. Payment must be made in full at the time of ticket purchase.

Cancellations and Refunds:
Please refer to our Cancellation & Refund Policy for detailed information.

Park Rules & Regulations:
All guests must comply with posted safety rules and instructions from park staff. Failure to do so may result in removal from the park without a refund.

Assumption of Risk & Liability:
By entering the park, guests assume all inherent risks associated with water park activities. Water Park chalo shall not be liable for any incidental or consequential damages, except in cases of gross negligence.

Intellectual Property:
All content on this website, including logos and branding, is the property of Water Park chalo and is protected by copyright laws.`,
    __v: 0,
    createdAt: { $date: "2025-06-27T15:11:22.774Z" },
    updatedAt: { $date: "2025-08-30T07:59:07.597Z" },
  },
  {
    _id: { $oid: "68b2aeec826e06e00bf57a28" },
    type: "refund",
    heading: "Cancellation & Refund Policy",
    content: `Cancellation & Refund Policy:
We want you to have a fantastic and safe time at Water Park chalo.

Ticket Cancellation & Refunds:
Tickets cancelled at least 48 hours before the scheduled visit date are eligible for a full refund. Cancellations made within 48 hours of the visit date are non-refundable.

Rescheduling Your Visit:
You may reschedule your tickets for a different date, subject to availability, if the request is made at least 24 hours before your original visit time. A rescheduling fee may apply.

Refund Timeline:
Refunds are processed within 5-7 business days and credited to the original payment method.

Park Closures & Inclement Weather:
If we close the park due to severe weather or unforeseen circumstances, you will be offered a full refund or the option to reschedule your visit at no extra cost.

Guest Conduct & Safety:
Guests removed from the park for violating safety rules or park policies will not be eligible for a refund.

Refund Methods:
Refunds are issued to the original payment method used for the ticket purchase.

Contact Information:
For cancellation or rescheduling inquiries, email us at wpc@waterparkchalo.com or call our guest services.`,
    __v: 0,
    createdAt: { $date: "2025-06-27T15:11:22.774Z" },
    updatedAt: { $date: "2025-08-30T07:59:53.334Z" },
  },
  {
    _id: { $oid: "68b2aef5826e06e00bf57a2a" },
    type: "privacy",
    heading: "Privacy Policy",
    content: `Privacy Policy:
Your privacy is important to us. This policy explains how Water Park chalo collects, uses, and protects your information.

Information We Collect:
We collect information you provide when purchasing tickets or season passes, such as name, email, address, and payment information.

How We Use Information:
We use your information to process ticket bookings, communicate with you about your visit, and improve our park services.

Information Sharing:
We do not sell, trade, or rent your personal information to third parties.

Data Security:
We implement appropriate security measures to protect your personal information.

Cookies and Tracking:
We use cookies to enhance your browsing experience on our website and analyze traffic to improve our offerings.

Third-Party Services:
We may use third-party services for secure payment processing and website analytics.

Data Retention:
We retain your information as long as necessary to provide our services and comply with legal obligations.

Your Rights:
You have the right to access, update, or delete your personal information by contacting us.

Children's Privacy:
Our online booking services are not intended for children under 13. A parent or guardian must provide consent and information for any minor.

Changes to Policy:
We may update this privacy policy from time to time.`,
    __v: 0,
    createdAt: { $date: "2025-06-27T15:11:22.775Z" },
    updatedAt: { $date: "2025-08-30T08:00:11.174Z" },
  },
];

    // Check if policies already exist
    const existingPolicies = await DataPage.find();
    if (existingPolicies.length > 0) {
      console.log('Policies already exist, skipping initialization');
      return res.json({ message: 'Policies already exist', count: existingPolicies.length });
    }

    // Add default policies
    const result = await DataPage.insertMany(defaultPolicies);
    console.log('Initialized policies:', result.length);
    
    res.status(201).json({ 
      message: 'Policies initialized successfully', 
      count: result.length,
      policies: result 
    });
  } catch (err) {
    console.error('Error initializing policies:', err);
    res.status(500).json({ error: err.message });
  }
}; 