/**
 * @jest-environment node
 */
import { triggerGroundingTool } from './groundingOrchestrator';
import { formatAttributedResponse } from './attributionService';
import { verifyGroceryWithGradientReasoning } from './groceryIntegration';
import { invokeGradientReasoning } from './gradientReasoning';
import { searchGroceryPrice } from './searchTools';

jest.mock('./gradientReasoning', () => ({
  invokeGradientReasoning: jest.fn(),
}));

jest.mock('./searchTools', () => ({
  searchGroceryPrice: jest.fn(),
  GROCERY_TOOL_SCHEMA: { name: 'search_grocery_price' },
  MEDICAL_TOOL_SCHEMA: { name: 'search_medical_database' },
}));

describe('Grocery Integration with Gradient AI tool orchestration', () => {
  it('should call invokeGradientReasoning and then searchGroceryPrice', async () => {
    (invokeGradientReasoning as jest.Mock).mockResolvedValue({
      tool_use: {
        name: 'search_grocery_price',
        input: { item: 'oatmeal' }
      }
    });

    (searchGroceryPrice as jest.Mock).mockResolvedValue({
      item: 'oatmeal',
      price: '$4.99',
      source: 'Mock Grocery API'
    });

    const result = await verifyGroceryWithGradientReasoning('price of oatmeal');
    expect(invokeGradientReasoning).toHaveBeenCalled();
    expect(searchGroceryPrice).toHaveBeenCalledWith('oatmeal');
    expect(result).toEqual({
      item: 'oatmeal',
      price: '$4.99',
      source: 'Mock Grocery API'
    });
  });
});

describe('End-to-End Grocery Grounding Integration via triggerGroundingTool', () => {
  // We can't easily mock verifyGroceryWithGradientReasoning here now that we also import it 
  // without doing an isolated mock block, but we can just use the real verifyGroceryWithGradientReasoning
  // with the mocked invokeGradientReasoning/searchTools from above.
  it('should complete a full grocery grounding flow', async () => {
    const context = { scenario: 'grocery', query: 'price of milk' };
    
    (invokeGradientReasoning as jest.Mock).mockResolvedValue({
      tool_use: {
        name: 'search_grocery_price',
        input: { item: 'milk' }
      }
    });

    (searchGroceryPrice as jest.Mock).mockResolvedValue({
      item: 'milk',
      price: '$3.49',
      source: 'External Product API Mock'
    });

    // 1. Trigger grounding
    const groundedResult = await triggerGroundingTool(context);
    expect(groundedResult.verified_fact).toContain('Verified: The price of milk is $3.49');
    expect(groundedResult.verified_fact).toContain('External Product API Mock');
    
    // 2. Format with attribution
    const finalResponse = formatAttributedResponse(
      groundedResult.verified_fact, 
      'External Product API Mock'
    );
    
    expect(finalResponse).toContain('According to External Product API Mock');
    expect(finalResponse).toContain('$3.49');
  });
});
