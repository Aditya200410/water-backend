const Settings = require('../models/Settings');

// Check if Settings model is available
if (!Settings) {
  console.error('Settings model not found');
}

// Get all settings
const getAllSettings = async (req, res) => {
  try {
    const settings = await Settings.find().sort({ key: 1 });
    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings', error: error.message });
  }
};

// Get a specific setting by key
const getSettingByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await Settings.findOne({ key });
    
    if (!setting) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }
    
    res.status(200).json({ success: true, setting });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch setting', error: error.message });
  }
};

// Create or update a setting
const upsertSetting = async (req, res) => {
  try {
    const { key, value, description } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: 'Key and value are required' });
    }
    
    let processedValue = value;
    // Ensure dates are stored correctly for weekend pricing
    if (key === 'weekend_pricing' && value.dates && Array.isArray(value.dates)) {
        processedValue = {
            ...value,
            dates: value.dates.map(dateStr => new Date(dateStr))
        };
    }
    
    const setting = await Settings.findOneAndUpdate(
      { key },
      { 
        value: processedValue, 
        description: description || '',
      },
      { 
        new: true, 
        upsert: true,
        runValidators: true 
      }
    );
    
    res.status(200).json({ 
      success: true, 
      message: 'Setting saved successfully',
      setting 
    });
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).json({ success: false, message: 'Failed to save setting', error: error.message });
  }
};

// Delete a setting
const deleteSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await Settings.findOneAndDelete({ key });
    
    if (!setting) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Setting deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ success: false, message: 'Failed to delete setting', error: error.message });
  }
};



module.exports = {
  getAllSettings,
  getSettingByKey,
  upsertSetting,
  deleteSetting,
  
};