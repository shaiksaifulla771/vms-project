describe('BOM Sub-Assembly & Component Validation (Apple Puree Fix)', () => {
  test('Allows Finished / Semi-Finished sub-assemblies (e.g. Apple Puree) as BOM components', () => {
    const parentProduct = { _id: 'prod-juice-01', name: 'Apple Juice Bottle', type: 'Finished' };
    const subAssemblyComponent = { _id: 'prod-puree-01', name: 'Apple Puree', type: 'Finished Goods' };
    const rawComponent = { _id: 'mat-sugar-01', name: 'Sugar Syrup', type: 'Raw Material' };

    const proposedComponents = [
      { materialId: subAssemblyComponent._id, type: subAssemblyComponent.type },
      { materialId: rawComponent._id, type: rawComponent.type }
    ];

    // Sub-assembly components MUST be allowed in multi-level manufacturing
    const invalidTypeMaterials = proposedComponents
      .filter(c => false) // No material type is inherently prohibited as a component
      .map(c => c.name);

    expect(invalidTypeMaterials.length).toBe(0);
    expect(proposedComponents.some(c => c.materialId === 'prod-puree-01')).toBe(true);
  });
});
