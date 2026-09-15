const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const InventoryItem = require('../models/InventoryItem');

// Geocoding helper using OpenStreetMap / Nominatim (free, open backend geocoding fallback)
async function geocodeAddress(addressObj) {
  try {
    const query = [addressObj.street, addressObj.city, addressObj.state, addressObj.country, addressObj.postalCode]
      .filter(Boolean)
      .join(', ');
    
    if (!query) return null;

    const axios = require('axios');
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'VendorOS-ERP/1.0' }, timeout: 4000 });
    
    if (res.data && res.data.length > 0) {
      return {
        lat: parseFloat(res.data[0].lat),
        lng: parseFloat(res.data[0].lon),
        formattedAddress: res.data[0].display_name,
        geocoded: true,
      };
    }
  } catch (err) {
    console.warn('[Geocoding] Nominatim geocode fallback failed or timed out:', err.message);
  }
  return null;
}

// GET /api/sites — List all sites with warehouses count
exports.getSites = async (req, res) => {
  try {
    const sites = await Site.find().sort({ createdAt: -1 });
    const warehouses = await Warehouse.find();
    
    const sitesWithCounts = sites.map(site => {
      const siteWhs = warehouses.filter(w => w.siteId && w.siteId.toString() === site._id.toString());
      return {
        ...site.toObject(),
        warehousesCount: siteWhs.length,
      };
    });

    res.json({ success: true, count: sitesWithCounts.length, sites: sitesWithCounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/sites/:id — Get single site detail
exports.getSiteById = async (req, res) => {
  try {
    const site = await Site.findById(req.params.id);
    if (!site) return res.status(404).json({ success: false, error: 'Site not found' });
    
    const warehouses = await Warehouse.find({ siteId: site._id });
    res.json({ success: true, site, warehouses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/sites — Create new site with optional automatic backend geocoding
exports.createSite = async (req, res) => {
  try {
    const { code, name, type, address, timezone, contacts } = req.body;
    
    const existing = await Site.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, error: `Site with code ${code} already exists` });
    }

    let geo = { geocoded: false };
    if (address) {
      const geoResult = await geocodeAddress(address);
      if (geoResult) geo = geoResult;
    }

    const site = await Site.create({
      code: code.toUpperCase(),
      name,
      type: type || 'Manufacturing Plant',
      address,
      geo,
      timezone: timezone || 'Asia/Kolkata',
      contacts: contacts || [],
      createdBy: req.user ? req.user._id : null,
    });

    res.status(201).json({ success: true, site });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// PUT /api/sites/:id — Update site details
exports.updateSite = async (req, res) => {
  try {
    const { name, type, address, status, timezone, contacts, geo } = req.body;
    
    let site = await Site.findById(req.params.id);
    if (!site) return res.status(404).json({ success: false, error: 'Site not found' });

    if (name) site.name = name;
    if (type) site.type = type;
    if (status) site.status = status;
    if (timezone) site.timezone = timezone;
    if (contacts) site.contacts = contacts;
    
    if (address) {
      site.address = { ...site.address, ...address };
      if (!geo || !geo.lat) {
        const geoResult = await geocodeAddress(site.address);
        if (geoResult) site.geo = geoResult;
      }
    }
    if (geo && geo.lat) {
      site.geo = { ...geo, geocoded: true };
    }

    await site.save();
    res.json({ success: true, site });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// GET /api/sites/:id/inventory-summary — Site inventory breakdown across warehouses
exports.getSiteInventorySummary = async (req, res) => {
  try {
    const warehouses = await Warehouse.find({ siteId: req.params.id });
    const warehouseIds = warehouses.map(w => w._id);
    
    const items = await InventoryItem.find({ warehouseId: { $in: warehouseIds } }).populate('materialId');

    const totalAvailable = items.reduce((acc, i) => acc + (i.available || 0), 0);
    const totalReserved = items.reduce((acc, i) => acc + (i.reserved || 0), 0);
    const totalOnHand = items.reduce((acc, i) => acc + (i.onHand || i.balance || 0), 0);
    const totalBlocked = items.reduce((acc, i) => acc + (i.blocked || 0), 0);

    res.json({
      success: true,
      summary: {
        warehousesCount: warehouses.length,
        itemsCount: items.length,
        totalOnHand,
        totalAvailable,
        totalReserved,
        totalBlocked,
      },
      warehouses,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
