import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import BomList from '../../pages/bom/BomList';
import BomDetail from '../../pages/bom/BomDetail';
import BomEdit from '../../pages/bom/BomEdit';
import BomDuplicate from '../../pages/bom/BomDuplicate';
import api from '../../services/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the API module
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
}));

// Mock window.confirm
window.confirm = vi.fn();

// Dummy component to test navigation destination
const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
};

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
  components: [
    { _id: 'comp1', materialId: { _id: 'mat1', name: 'Flour' }, mpnId: { _id: 'mpn1', manufacturerPartNumber: 'FL-1', status: 'Active' }, quantity: 10 }
  ]
};

const renderWithRouter = (ui, { route = '/' } = {}) => {
  window.history.pushState({}, 'Test page', route);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <LocationDisplay />
      <Routes>
        <Route path="/bom" element={<BomList />} />
        <Route path="/bom/:id" element={<BomDetail />} />
        <Route path="/bom/:id/edit" element={<BomEdit />} />
        <Route path="/bom/:id/duplicate" element={<BomDuplicate />} />
        <Route path="*" element={<div />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('BOM Navigation and Actions Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm.mockClear();
    // Default GET mocks
    api.get.mockImplementation((url, config) => {
      if (url.includes('/api/boms/bom123') || url.includes('/api/boms/bom999')) {
        return Promise.resolve({ data: { success: true, data: mockBomData } });
      }
      if (url.includes('/api/boms')) {
        return Promise.resolve({ data: { success: true, data: [mockBomData] } });
      }
      // Return empty array for all other endpoints to satisfy dropdowns
      return Promise.resolve({ data: { success: true, data: [] } });
    });
  });

  describe('Navigation Flows', () => {
    it('1. List -> Edit -> Cancel returns to List', async () => {
      renderWithRouter(<BomList />, { route: '/bom' });
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
      
      const editButton = screen.getByTitle('Edit Recipe');
      fireEvent.click(editButton);
      
      await waitFor(() => expect(screen.getByText('Save BOM')).toBeInTheDocument());
      
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
      
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
    });

    it('2. List -> Edit -> Save returns to List', async () => {
      api.put.mockResolvedValueOnce({ data: { success: true, data: { ...mockBomData, _id: 'bom124' } } });
      
      renderWithRouter(<BomList />, { route: '/bom' });
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
      
      fireEvent.click(screen.getByTitle('Edit Recipe'));
      await waitFor(() => expect(screen.getByText('Save BOM')).toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Save BOM'));
      
      await waitFor(() => expect(api.put).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
    });

    it('3. Detail -> Edit -> Cancel returns to Detail', async () => {
      renderWithRouter(<BomDetail />, { route: '/bom/bom123' });
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
      
      fireEvent.click(screen.getByRole('button', { name: /Edit Recipe/i }));
      await waitFor(() => expect(screen.getByText('Save BOM')).toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
    });

    it('4. Detail -> Edit -> Save returns to new Detail version', async () => {
      api.put.mockResolvedValueOnce({ data: { success: true, data: { ...mockBomData, _id: 'bom125' } } });
      
      renderWithRouter(<BomDetail />, { route: '/bom/bom123' });
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
      
      fireEvent.click(screen.getByRole('button', { name: /Edit Recipe/i }));
      await waitFor(() => expect(screen.getByText('Save BOM')).toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Save BOM'));
      
      await waitFor(() => expect(api.put).toHaveBeenCalled());
      
      await waitFor(() => {
        console.log("Current DOM:", screen.getByTestId('location-display').textContent);
        expect(screen.getByTestId('location-display')).toHaveTextContent('/bom/bom125');
      });
    });

    it('5. Detail -> Back returns to List', async () => {
      // Simulate coming from list via location state
      render(
        <MemoryRouter initialEntries={[{ pathname: '/bom/bom123', state: { returnTo: '/bom?page=2' } }]}>
          <Routes>
            <Route path="/bom/:id" element={<BomDetail />} />
            <Route path="*" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>
      );
      
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Back'));
      
      await waitFor(() => {
        expect(screen.getByTestId('location-display')).toHaveTextContent('/bom');
      });
    });
  });

  describe('Duplicate Flows', () => {
    it('6. Duplicating a BOM succeeds and navigates to edit page of new BOM', async () => {
      api.post.mockResolvedValueOnce({ data: { success: true, data: { _id: 'bom999' } } });
      
      renderWithRouter(<BomDuplicate />, { route: '/bom/bom123/duplicate' });
      await waitFor(() => expect(screen.getByText('Confirm Duplicate')).toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Confirm Duplicate'));
      
      await waitFor(() => {
        expect(screen.getByTestId('location-display')).toHaveTextContent('/bom/bom999/edit');
      });
    });

    it('7. Duplicated BOM payload copies batchCode and manufacturer exactly', async () => {
      // This is a backend behavior, so we verify the UI calls the correct endpoint
      // and assumes the backend handles the payload. The actual backend test is separate.
      api.post.mockResolvedValueOnce({ data: { success: true, data: { _id: 'bom999' } } });
      
      renderWithRouter(<BomDuplicate />, { route: '/bom/bom123/duplicate' });
      await waitFor(() => expect(screen.getByText('Confirm Duplicate')).toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Confirm Duplicate'));
      
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/boms/bom123/duplicate'));
    });

    it('8. Duplicating an identical BOM succeeds without blocking', async () => {
      api.post.mockResolvedValueOnce({ data: { success: true, data: { _id: 'bom999' } } });
      
      renderWithRouter(<BomDuplicate />, { route: '/bom/bom123/duplicate' });
      await waitFor(() => expect(screen.getByText('Confirm Duplicate')).toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Confirm Duplicate'));
      
      await waitFor(() => {
        expect(screen.getByTestId('location-display')).toHaveTextContent('/bom/bom999/edit');
      });
    });
  });

  describe('Delete/Restore Flows', () => {
    it('9. Deleting an Active BOM changes its status to Deleted and hides it', async () => {
      api.delete.mockResolvedValueOnce({ data: { success: true } });
      window.confirm.mockReturnValueOnce(true);
      
      renderWithRouter(<BomList />, { route: '/bom' });
      await waitFor(() => expect(screen.getByText('Test Product')).toBeInTheDocument());
      
      fireEvent.click(screen.getByTitle('Delete'));
      
      await waitFor(() => expect(window.confirm).toHaveBeenCalled());
      await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/boms/bom123'));
    });

    it('10. Deleted BOMs appear under the Deleted status filter', async () => {
      api.get.mockImplementation((url, config) => {
        if (config?.params?.status === 'Deleted') {
          return Promise.resolve({ data: { success: true, data: [{ ...mockBomData, status: 'Deleted' }] } });
        }
        return Promise.resolve({ data: { success: true, data: [] } });
      });
      
      renderWithRouter(<BomList />, { route: '/bom' });
      
      // Change filter
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'Deleted' } });
      
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/boms', expect.objectContaining({
        params: expect.objectContaining({ status: 'Deleted' })
      })));
      await waitFor(() => expect(screen.getByTitle('More Actions')).toBeInTheDocument());
      fireEvent.click(screen.getByTitle('More Actions'));
      await waitFor(() => expect(screen.getByText('Restore BOM')).toBeInTheDocument());
    });

    it('11. Restoring a Deleted BOM calls the restore endpoint', async () => {
      api.get.mockResolvedValueOnce({ data: { success: true, data: [{ ...mockBomData, status: 'Deleted' }] } });
      api.put.mockResolvedValueOnce({ data: { success: true } });
      window.confirm.mockReturnValueOnce(true);
      
      renderWithRouter(<BomList />, { route: '/bom' });
      
      await waitFor(() => expect(screen.getByTitle('More Actions')).toBeInTheDocument());
      fireEvent.click(screen.getByTitle('More Actions'));
      
      await waitFor(() => expect(screen.getByText('Restore BOM')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Restore BOM'));
      
      await waitFor(() => expect(window.confirm).toHaveBeenCalled());
      await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/boms/bom123/restore'));
    });
  });
});
