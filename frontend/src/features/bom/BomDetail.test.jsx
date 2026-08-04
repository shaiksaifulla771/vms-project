import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BomDetail from '../../pages/bom/BomDetail';
import api from '../../services/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the API module
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockBomData = {
  _id: 'bom123',
  productId: { name: 'Test Product', code: 'PROD-001' },
  batchSize: 100,
  batchUOM: 'kg',
  batchCode: 'TEST-BATCH-99',
  effectiveDate: '2026-08-04T00:00:00.000Z',
  status: 'Active',
  cloneCount: 0,
  liveTotalCost: 5000,
  components: []
};

const mockBomDataNoBatch = {
  ...mockBomData,
  batchCode: '',
  _id: 'bom456'
};

describe('BomDetail Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (id) => {
    return render(
      <MemoryRouter initialEntries={[`/bom/${id}`]}>
        <Routes>
          <Route path="/bom/:id" element={<BomDetail />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders Batch Code when provided', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: mockBomData } });
    renderComponent('bom123');
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Product')).toBeInTheDocument();
    });

    // Check if Batch Code is rendered
    expect(screen.getByText('Batch Code: TEST-BATCH-99')).toBeInTheDocument();
  });

  it('renders dash when Batch Code is empty', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: mockBomDataNoBatch } });
    renderComponent('bom456');
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Product')).toBeInTheDocument();
    });

    // Check if Batch Code empty state is rendered
    expect(screen.getByText('Batch Code: —')).toBeInTheDocument();
  });
});
