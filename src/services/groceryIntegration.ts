import { invokeGradientReasoning } from './gradientReasoning';
import { searchGroceryPrice } from './searchTools';

export interface GroceryVerificationResult {
  item: string;
  price: string;
  source: string;
}

export async function verifyGroceryWithGradientReasoning(query: string): Promise<GroceryVerificationResult | null> {
  const tools = [
    {
      name: 'search_grocery_price',
      description: 'Search for the current price of a grocery item from an external database',
      input_schema: { type: 'object', properties: { item: { type: 'string' } } }
    }
  ];

  const response = await invokeGradientReasoning([
    { role: 'user', content: query }
  ], tools) as { tool_use?: { name: string; input: { item: string } } };

  if (response.tool_use && response.tool_use.name === 'search_grocery_price') {
    const item = response.tool_use.input.item;
    // Call the mock external API via searchTools or similar
    const result = await searchGroceryPrice(item);
    return {
      item: result.item,
      price: result.price,
      source: result.source
    };
  }

  return null;
}
