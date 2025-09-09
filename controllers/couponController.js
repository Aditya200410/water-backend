const Coupon = require('../models/coupon');

// Get all coupons
exports.getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort('-createdAt');
    res.json(coupons);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ message: "Error fetching coupons", error: error.message });
  }
};

// Create new coupon
exports.createCoupon = async (req, res) => {
  try {
    const { 
      code, 
      name, 
      discountType, 
      discountValue, 
      maxUses, 
      minOrderAmount, 
      expiryDate, 
      isActive,
      applicableProducts,
      isProductSpecific,
      description,
      maxDiscount
    } = req.body;

    // Validate required fields
    if (!code || !name || !discountValue || !maxUses || !minOrderAmount || !expiryDate) {
      return res.status(400).json({ message: "All required fields are missing" });
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    const newCoupon = new Coupon({
      code: code.toUpperCase(),
      name: name.trim(),
      discountType: discountType || 'percentage',
      discountValue: Number(discountValue),
      usageLimit: Number(maxUses),
      minPurchase: Number(minOrderAmount),
      endDate: new Date(expiryDate),
      isActive: isActive !== undefined ? isActive : true,
      startDate: new Date(),
      applicableProducts: applicableProducts || [],
      isProductSpecific: isProductSpecific || false,
      description: description || '',
      maxDiscount: maxDiscount ? Number(maxDiscount) : undefined
    });

    await newCoupon.save();
    res.status(201).json(newCoupon);
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ message: "Error creating coupon", error: error.message });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const { 
      code, 
      name, 
      discountType, 
      discountValue, 
      maxUses, 
      minOrderAmount, 
      expiryDate, 
      isActive,
      applicableProducts,
      isProductSpecific,
      description,
      maxDiscount
    } = req.body;
    
    // Check if coupon exists
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    // If code is being changed, check if new code already exists
    if (code && code !== coupon.code) {
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        return res.status(400).json({ message: "Coupon code already exists" });
      }
    }

    const updateData = {
      code: code ? code.toUpperCase() : coupon.code,
      name: name ? name.trim() : coupon.name,
      discountType: discountType || coupon.discountType,
      discountValue: discountValue ? Number(discountValue) : coupon.discountValue,
      usageLimit: maxUses ? Number(maxUses) : coupon.usageLimit,
      minPurchase: minOrderAmount ? Number(minOrderAmount) : coupon.minPurchase,
      endDate: expiryDate ? new Date(expiryDate) : coupon.endDate,
      isActive: isActive !== undefined ? isActive : coupon.isActive,
      applicableProducts: applicableProducts !== undefined ? applicableProducts : coupon.applicableProducts,
      isProductSpecific: isProductSpecific !== undefined ? isProductSpecific : coupon.isProductSpecific,
      description: description !== undefined ? description : coupon.description,
      maxDiscount: maxDiscount !== undefined ? (maxDiscount ? Number(maxDiscount) : undefined) : coupon.maxDiscount
    };

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedCoupon);
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ message: "Error updating coupon", error: error.message });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ message: "Error deleting coupon", error: error.message });
  }
};

// Validate coupon and calculate discounted price
exports.validateCoupon = async (req, res) => {
  try {
    const { code, cartTotal, cartItems } = req.body;

    console.log('Coupon validation request:', { code, cartTotal, cartItems });

    if (!code || !cartTotal) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code and cart total are required'
      });
    }

    const coupon = await Coupon.findOne({ 
      code: code.toUpperCase(),
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gt: new Date() }
    }).populate('applicableProducts', 'name price');

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired coupon code'
      });
    }

    console.log('Found coupon:', {
      code: coupon.code,
      isProductSpecific: coupon.isProductSpecific,
      applicableProducts: coupon.applicableProducts.length,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue
    });

    // Check minimum purchase requirement
    if (cartTotal < coupon.minPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required to use this coupon`
      });
    }

    // Check usage limit
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: 'Coupon usage limit exceeded'
      });
    }

    let discountAmount = 0;
    let applicableItems = [];

    // If coupon is product-specific, calculate discount only for applicable products
    if (coupon.isProductSpecific && coupon.applicableProducts.length > 0) {
      if (!cartItems || !Array.isArray(cartItems)) {
        return res.status(400).json({
          success: false,
          message: 'Cart items are required for product-specific coupons'
        });
      }

      // Find applicable items in cart
      const applicableProductIds = coupon.applicableProducts.map(p => p._id.toString());
      console.log('Applicable product IDs:', applicableProductIds);
      console.log('Cart items:', cartItems);
      
      applicableItems = cartItems.filter(item => {
        const itemProductId = item.product._id || item.product;
        console.log('Checking item product ID:', itemProductId, 'against applicable IDs');
        return applicableProductIds.includes(itemProductId.toString());
      });

      if (applicableItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'This coupon is not applicable to the selected product. Please check if the coupon is valid for this item.'
        });
      }

      // Calculate total for applicable items
      const applicableTotal = applicableItems.reduce((sum, item) => {
        return sum + (item.price * item.quantity);
      }, 0);

      // Calculate discount based on type
      if (coupon.discountType === 'percentage') {
        discountAmount = (applicableTotal * coupon.discountValue) / 100;
      } else {
        discountAmount = coupon.discountValue;
      }
    } else {
      // Apply discount to entire cart (for non-product-specific coupons)
      if (coupon.discountType === 'percentage') {
        discountAmount = (cartTotal * coupon.discountValue) / 100;
      } else {
        discountAmount = coupon.discountValue;
      }
    }
    
    // Apply max discount if specified
    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }

    // Calculate final price
    const finalPrice = cartTotal - discountAmount;

    res.json({
      success: true,
      data: {
        coupon,
        discountAmount,
        finalPrice,
        applicableItems: applicableItems.length > 0 ? applicableItems : null,
        message: `Coupon applied successfully! You saved ₹${discountAmount.toFixed(2)}`
      }
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating coupon'
    });
  }
};

// Apply coupon (increment usage count)
exports.applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    
    const coupon = await Coupon.findOneAndUpdate(
      { code: code.toUpperCase() },
      { $inc: { usedCount: 1 } },
      { new: true }
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      message: 'Coupon applied successfully'
    });

  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying coupon'
    });
  }
}; 