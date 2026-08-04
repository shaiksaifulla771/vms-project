import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BomList from '../../pages/bom/BomList';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api';

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

describe('BomList Batch Code Inline Editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders batch code column and existing batch code', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            _id: 'bom1',
            productId: { name: 'Product A', code: 'PRD-A' },
            batchSize: 10,
            batchUOM: 'kg',
            status: 'Active',
            batchCode: 'BATCH-A-123'
          }
        ]
      }
    });

    render(
      <MemoryRouter>
        <BomList />
      </MemoryRouter>
    );

    // Should render the new BATCH CODE column header
    expect(await screen.findByText('Batch Code')).toBeInTheDocument();
    
    // Should render the batch code value
    expect(await screen.findByText('BATCH-A-123')).toBeInTheDocument();
  });

  it('handles inline edit save and cancel', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            _id: 'bom1',
            productId: { name: 'Product B', code: 'PRD-B' },
            batchSize: 5,
            batchUOM: 'kg',
            status: 'Active',
            batchCode: '' // empty initially
          }
        ]
      }
    });

    render(
      <MemoryRouter>
        <BomList />
      </MemoryRouter>
    );

    // Empty state should be a dash inside the clickable div
    const emptyState = await screen.findByTestId('batch-code-bom1');
    expect(emptyState).toHaveTextContent('—');

    // Click to edit
    fireEvent.click(emptyState);

    // Input should appear
    const input = screen.getByTestId('batch-code-input');
    expect(input).toBeInTheDocument();
    
    // Type new value
    fireEvent.change(input, { target: { value: 'NEW-BATCH' } });

    // Cancel by pressing Escape
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    
    // Input should be gone, dash should be back
    expect(screen.queryByTestId('batch-code-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('batch-code-bom1')).toHaveTextContent('—');

    // Click to edit again
    fireEvent.click(screen.getByTestId('batch-code-bom1'));
    
    const input2 = screen.getByTestId('batch-code-input');
    fireEvent.change(input2, { target: { value: 'NEW-BATCH-2' } });

    // Mock API put for saving
    api.put.mockResolvedValueOnce({
      data: {
        success: true,
        data: { batchCode: 'NEW-BATCH-2' }
      }
    });

    // Save by pressing Enter
    fireEvent.keyDown(input2, { key: 'Enter', code: 'Enter' });

    // Ensure API was called with just the batchCode
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/boms/bom1', { batchCode: 'NEW-BATCH-2' });
    });

    // Should update UI to show new batch code
    expect(await screen.findByText('NEW-BATCH-2')).toBeInTheDocument();
  });
});
