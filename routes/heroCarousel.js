const express = require('express');
const router = express.Router();
const { isAdmin, authenticateToken } = require('../middleware/auth');

const {
  upload,
  getAllCarouselItems,
  getCarouselItem,
  getActiveCarouselItems,
  createCarouselItemWithFiles,
  updateCarouselItemWithFiles,
  deleteCarouselItem,
  toggleCarouselActive,
  updateCarouselOrder
} = require('../controllers/heroCarouselController');

// Configure single file upload field
const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 }
]);

// Public routes
router.get('/active', getActiveCarouselItems);
router.get('/', getAllCarouselItems);

// Protected routes (admin only)
router.get('/:id', authenticateToken, isAdmin, getCarouselItem);
router.post('/', authenticateToken, isAdmin, uploadFields, createCarouselItemWithFiles);
router.put('/:id', authenticateToken, isAdmin, uploadFields, updateCarouselItemWithFiles);
router.delete('/:id', authenticateToken, isAdmin, deleteCarouselItem);
router.patch('/:id/toggle-active', authenticateToken, isAdmin, toggleCarouselActive);
router.post('/update-order', authenticateToken, isAdmin, updateCarouselOrder);

module.exports = router; 