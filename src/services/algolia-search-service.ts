/**
 * Algolia Search Service
 * Converts natural language search queries into Algolia search parameters
 * Uses DeepSeek to generate the Algolia parameters and passes them to the MCP tool
 */

import { deepseekClient } from './deepseek-client';
import { mcpClient } from './mcp-client';
import { debug, error, info } from '../utils/logger';

/**
 * Algolia Search Parameters
 * Based on https://www.algolia.com/doc/api-reference/search-api-parameters/
 */
export interface AlgoliaSearchParams {
  // Core search parameters
  query?: string;                      // The search query
  filters?: string;                    // Filters to apply (e.g., 'type:post')
  facetFilters?: string[] | string[][]; // Facet filters
  numericFilters?: string[] | string[][]; // Numeric filters
  
  // Pagination parameters
  page?: number;                       // Page number (0-based)
  hitsPerPage?: number;                // Number of hits per page
  offset?: number;                     // Offset of the first hit to return
  length?: number;                     // Number of hits to return
  
  // Highlighting and snippeting parameters
  attributesToRetrieve?: string[];     // Attributes to include in the response
  attributesToHighlight?: string[];    // Attributes to highlight
  attributesToSnippet?: string[];      // Attributes to snippet
  highlightPreTag?: string;            // Tag to use before highlighted parts
  highlightPostTag?: string;           // Tag to use after highlighted parts
  snippetEllipsisText?: string;        // Text to use for ellipsis in snippets
  restrictHighlightAndSnippetArrays?: boolean; // Whether to restrict highlighting and snippeting to array items that match the query
  
  // Geo-search parameters
  aroundLatLng?: string;               // Latitude and longitude for geo-search
  aroundRadius?: number;               // Radius for geo-search (in meters)
  aroundPrecision?: number;            // Precision for geo-search
  minimumAroundRadius?: number;        // Minimum radius for geo-search
  insideBoundingBox?: string[][] | string; // Bounding box for geo-search
  insidePolygon?: string[][] | string; // Polygon for geo-search
  
  // Advanced parameters
  getRankingInfo?: boolean;            // Whether to include ranking info in the response
  analytics?: boolean;                 // Whether to include the query in analytics
  analyticsTags?: string[];            // Tags to associate with the query for analytics
  synonyms?: boolean;                  // Whether to enable synonyms
  replaceSynonymsInHighlight?: boolean; // Whether to replace synonyms in highlight results
  minProximity?: number;               // Minimum proximity for proximity criterion
  responseFields?: string[];           // Fields to include in the response
}

/**
 * Natural Language Search Result
 */
export interface NaturalLanguageSearchResult {
  success: boolean;
  searchParams?: AlgoliaSearchParams;
  searchResults?: any;
  error?: string;
  details?: string;
}

/**
 * Algolia Search Service
 * Converts natural language search queries into Algolia search parameters
 */
export class AlgoliaSearchService {
  /**
   * Convert a natural language query to Algolia search parameters
   * @param query The natural language query
   * @returns The Algolia search parameters
   */
  async naturalLanguageToAlgoliaParams(query: string): Promise<AlgoliaSearchParams> {
    try {
      info(`Converting natural language query to Algolia parameters: "${query}"`);
      
      // Define relationship patterns with descriptive verbs
      const relationshipPatterns = [
        { 
          relation: 'refs.hasOwner', 
          verb: 'created/owned by',
          keywords: ['by', 'from', 'created by', 'written by', 'posted by', 'authored by', 'owned by', 'creator', 'author', 'owner']
        },
        { 
          relation: 'refs.hasSubject', 
          verb: 'about',
          keywords: ['about', 'regarding', 'concerning', 'on the topic of', 'related to', 'subject']
        },
        { 
          relation: 'refs.isInGroup', 
          verb: 'in',
          keywords: ['in group', 'in the group', 'in community', 'in the community', 'from group', 'from the group']
        },
        { 
          relation: 'refs.hasFollower', 
          verb: 'followed by',
          keywords: ['followed by', 'subscribed to by', 'subscriber']
        },
        { 
          relation: 'refs.hasModerator', 
          verb: 'moderated by',
          keywords: ['moderated by', 'curated by', 'managed by', 'administered by', 'moderator']
        },
        { 
          relation: 'refs.hasMention', 
          verb: 'mentioning',
          keywords: ['mention', 'mentions', 'mentioning', 'that mention', 'that mentions', 'mentions user']
        }
      ];
      
      // Generate relationship mapping section for the system prompt
      const relationshipMappingSection = relationshipPatterns.map((pattern, index) => {
        return `   - For content ${pattern.verb} a user: use "${pattern.relation}:<username>"`;
      }).join('\n');
      
      // Generate relationship examples for the system prompt
      const relationshipExamples = [
        `"comments by John" → { "query": "", "filters": "type:comment AND refs.hasOwner:John" }`,
        `"posts created by Sarah" → { "query": "", "filters": "type:post AND refs.hasOwner:Sarah" }`,
        `"content owned by @username" → { "query": "", "filters": "refs.hasOwner:@username" }`,
        `"reviews about @username" → { "query": "", "filters": "type:review AND refs.hasSubject:@username" }`,
        `"posts moderated by @admin" → { "query": "", "filters": "type:post AND refs.hasModerator:@admin" }`,
        `"content in @phoenix.az.us group" → { "query": "", "filters": "refs.isInGroup:@phoenix.az.us" }`,
        `"find posts that mention Eve" → { "query": "", "filters": "type:post AND refs.hasMention:Eve" }`
      ];
      
      // Create a system prompt that explains how to convert natural language to Algolia parameters
      const systemPrompt = `
You are an expert in converting natural language search queries into Algolia search parameters.
Your task is to analyze the user's search query and generate the appropriate Algolia search parameters.

IMPORTANT: Always separate content terms from content type filters. For example, if the user searches for "cat posts", 
the query should be "cat" and the filter should be "type:post", NOT "cat posts" as the query.

Follow these guidelines:
1. Extract the main search terms for the 'query' parameter (what the user is actually searching for)
2. Identify any filters that should be applied (type, category, tags, etc.)
   - ALWAYS include a type filter (e.g., "type:post", "type:comment") when the content type is mentioned
   - Common content types: post, comment, user, group, event
3. Determine appropriate pagination settings if mentioned
4. Set up highlighting and snippeting if relevant
5. Configure geo-search parameters if location is mentioned
6. Add any other relevant Algolia parameters
7. IMPORTANT: For queries about mentions, use refs.hasMention instead of the query field
   - For example, "find posts that mention Eve" should map to { "query": "", "filters": "type:post AND refs.hasMention:Eve" }
   - NOT { "query": "eve", "filters": "type:post" }
8. For queries about authors, creators, owners, etc., use the refs-based filters:
${relationshipMappingSection}

Example conversions:
- "cat posts" → { "query": "cat", "filters": "type:post" }
- "posts about cats" → { "query": "cats", "filters": "type:post" }
- "recent posts about safety" → { "query": "safety", "filters": "type:post", "numericFilters": ["createdAt>timestamp_for_recent_date"] }
- ${relationshipExamples.join('\n- ')}
- "events in Phoenix" → { "query": "", "filters": "type:event AND location:Phoenix" }
- "safety tips" → { "query": "safety tips", "filters": "type:post" }
- "users named Sarah" → { "query": "Sarah", "filters": "type:user" }

Return ONLY a valid JSON object with the Algolia parameters. Do not include any explanations or markdown.
The JSON should be compatible with the following TypeScript interface:

interface AlgoliaSearchParams {
  query?: string;
  filters?: string;
  facetFilters?: string[] | string[][];
  numericFilters?: string[] | string[][];
  page?: number;
  hitsPerPage?: number;
  offset?: number;
  length?: number;
  attributesToRetrieve?: string[];
  attributesToHighlight?: string[];
  attributesToSnippet?: string[];
  highlightPreTag?: string;
  highlightPostTag?: string;
  snippetEllipsisText?: string;
  restrictHighlightAndSnippetArrays?: boolean;
  aroundLatLng?: string;
  aroundRadius?: number;
  aroundPrecision?: number;
  minimumAroundRadius?: number;
  insideBoundingBox?: string[][] | string;
  insidePolygon?: string[][] | string;
  getRankingInfo?: boolean;
  analytics?: boolean;
  analyticsTags?: string[];
  synonyms?: boolean;
  replaceSynonymsInHighlight?: boolean;
  minProximity?: number;
  responseFields?: string[];
}

For the 'filters' parameter, use Algolia's filter syntax:
- Combine conditions with AND, OR, NOT
- Example: 'type:post AND (category:news OR category:blog) AND NOT tags:private'

For geo-search, convert location names to coordinates if possible, or use placeholder coordinates.
`;

      // Call DeepSeek to generate the Algolia parameters
      const response = await deepseekClient.createChatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.2, // Low temperature for more deterministic results
        max_tokens: 1000
      });

      if (!response.success || !response.data) {
        throw new Error('Failed to generate Algolia parameters');
      }

      // Extract the JSON from the response
      const content = response.data.choices[0].message.content.trim();
      
      // Parse the JSON
      let algoliaParams: AlgoliaSearchParams;
      try {
        algoliaParams = JSON.parse(content);
      } catch (err) {
        // If the response is not valid JSON, try to extract JSON from it
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                          content.match(/```\n([\s\S]*?)\n```/) ||
                          content.match(/\{[\s\S]*\}/);
                          
        if (jsonMatch) {
          algoliaParams = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
          throw new Error('Failed to parse Algolia parameters from response');
        }
      }

      // Log the raw parameters generated by DeepSeek
      info(`Raw Algolia parameters from DeepSeek for query "${query}":`, JSON.stringify(algoliaParams, null, 2));
      
      // Validate and enhance the generated parameters
      const enhancedParams = this.validateAndEnhanceParams(algoliaParams, query);
      
      // Log the enhanced parameters
      info(`Enhanced Algolia parameters for query "${query}":`, JSON.stringify(enhancedParams, null, 2));
      
      // Log the differences between raw and enhanced parameters
      const paramDifferences = this.logParameterDifferences(algoliaParams, enhancedParams);
      if (paramDifferences.length > 0) {
        info(`Parameter differences for query "${query}":`, paramDifferences);
      }
      
      algoliaParams = enhancedParams;

      return algoliaParams;
    } catch (err: any) {
      error(`Failed to convert natural language query to Algolia parameters: ${err.message}`, {
        query,
        error: err
      });
      
      // Return a basic search with the original query
      return {
        query,
        hitsPerPage: 20,
        page: 0
      };
    }
  }

  /**
   * Perform a natural language search
   * @param query The natural language query
   * @returns The search results
   */
  async search(query: string): Promise<NaturalLanguageSearchResult> {
    try {
      info(`Performing natural language search: "${query}"`);
      
      // Convert the natural language query to Algolia parameters
      const searchParams = await this.naturalLanguageToAlgoliaParams(query);
      
      // Call the MCP search_posts tool with the generated parameters
      const result = await mcpClient.callTool({
        tool: 'search_posts',
        arguments: searchParams
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Search failed');
      }
      
      return {
        success: true,
        searchParams,
        searchResults: result.data
      };
    } catch (err: any) {
      error(`Natural language search failed: ${err.message}`, {
        query,
        error: err
      });
      
      return {
        success: false,
        error: err.message,
        details: err.stack
      };
    }
  }

  /**
   * Log the differences between the original and enhanced parameters
   * @param original The original parameters
   * @param enhanced The enhanced parameters
   * @returns An array of difference descriptions
   */
  private logParameterDifferences(original: AlgoliaSearchParams, enhanced: AlgoliaSearchParams): string[] {
    const differences: string[] = [];
    
    // Use type assertion to allow string indexing
    const originalAny = original as Record<string, any>;
    const enhancedAny = enhanced as Record<string, any>;
    
    // Check for added or modified parameters
    for (const key in enhancedAny) {
      if (key in originalAny) {
        // Parameter exists in both, check if it was modified
        if (JSON.stringify(originalAny[key]) !== JSON.stringify(enhancedAny[key])) {
          differences.push(`Modified ${key}: ${JSON.stringify(originalAny[key])} -> ${JSON.stringify(enhancedAny[key])}`);
        }
      } else {
        // Parameter was added
        differences.push(`Added ${key}: ${JSON.stringify(enhancedAny[key])}`);
      }
    }
    
    // Check for removed parameters
    for (const key in originalAny) {
      if (!(key in enhancedAny)) {
        differences.push(`Removed ${key}: ${JSON.stringify(originalAny[key])}`);
      }
    }
    
    return differences;
  }

  /**
   * Validate and enhance the generated Algolia parameters
   * @param params The generated Algolia parameters
   * @param originalQuery The original natural language query
   * @returns The validated and enhanced Algolia parameters
   */
  private validateAndEnhanceParams(params: AlgoliaSearchParams, originalQuery: string): AlgoliaSearchParams {
    // Make a copy of the params to avoid modifying the original
    const enhancedParams = { ...params };
    
    // Check for common patterns in the original query
    const lowerQuery = originalQuery.toLowerCase();
    
    // Check if the query contains words indicating content type
    const contentTypePatterns = [
      { type: 'post', keywords: ['post', 'posts', 'article', 'articles', 'blog', 'blogs'] },
      { type: 'comment', keywords: ['comment', 'comments', 'reply', 'replies', 'response', 'responses'] },
      { type: 'user', keywords: ['user', 'users', 'person', 'people', 'member', 'members', 'profile', 'profiles'] },
      { type: 'event', keywords: ['event', 'events', 'meetup', 'meetups', 'gathering', 'gatherings'] },
      { type: 'group', keywords: ['group', 'groups', 'community', 'communities', 'club', 'clubs'] },
      { type: 'review', keywords: ['review', 'reviews', 'rating', 'ratings', 'feedback'] }
    ];
    
    // If no filters are set, try to detect content type from the query
    if (!enhancedParams.filters) {
      for (const pattern of contentTypePatterns) {
        if (pattern.keywords.some(keyword => lowerQuery.includes(keyword))) {
          enhancedParams.filters = `type:${pattern.type}`;
          
          // If the query is just the content type, extract the actual search terms
          for (const keyword of pattern.keywords) {
            if (lowerQuery === keyword || lowerQuery === `${keyword} about` || lowerQuery === `${keyword} on`) {
              enhancedParams.query = ''; // Empty query if it's just asking for a content type
              break;
            } else if (lowerQuery.startsWith(`${keyword} about `) || lowerQuery.startsWith(`${keyword} on `)) {
              // Extract the actual search terms after "posts about" or similar patterns
              const regex = new RegExp(`^${keyword} (about|on) `, 'i');
              const searchTerms = lowerQuery.replace(regex, '');
              enhancedParams.query = searchTerms;
              break;
            } else if (lowerQuery.endsWith(` ${keyword}`)) {
              // Extract the actual search terms before "posts" or similar patterns
              const regex = new RegExp(` ${keyword}$`, 'i');
              const searchTerms = lowerQuery.replace(regex, '');
              enhancedParams.query = searchTerms;
              break;
            }
          }
        }
      }
    }
    
    // Check for time-related terms
    const timePatterns = [
      { term: 'recent', filter: 'createdAt>now-7d' },
      { term: 'today', filter: 'createdAt>now-1d' },
      { term: 'this week', filter: 'createdAt>now-7d' },
      { term: 'this month', filter: 'createdAt>now-30d' },
      { term: 'this year', filter: 'createdAt>now-365d' }
    ];
    
    // Add time filters if detected
    for (const pattern of timePatterns) {
      if (lowerQuery.includes(pattern.term)) {
        if (!enhancedParams.numericFilters) {
          enhancedParams.numericFilters = [pattern.filter];
        } else if (Array.isArray(enhancedParams.numericFilters)) {
          // Check if numericFilters is a string array (not a nested array)
          if (enhancedParams.numericFilters.every(f => typeof f === 'string')) {
            // Safe to use includes and push since we've verified it's a string array
            const stringFilters = enhancedParams.numericFilters as string[];
            if (!stringFilters.includes(pattern.filter)) {
              stringFilters.push(pattern.filter);
            }
          } else {
            // It's a nested array, so we need to add a new string array
            (enhancedParams.numericFilters as string[][]).push([pattern.filter]);
          }
        }
      }
    }
    
    // Ensure we have at least some basic parameters
    if (!enhancedParams.query && !enhancedParams.filters) {
      enhancedParams.query = originalQuery; // Fall back to using the original query
    }
    
    // Set default values for pagination if not provided
    if (enhancedParams.hitsPerPage === undefined) {
      enhancedParams.hitsPerPage = 20;
    }
    
    if (enhancedParams.page === undefined) {
      enhancedParams.page = 0;
    }
    
    return enhancedParams;
  }

  /**
   * Enhance an existing Algolia search query with natural language understanding
   * @param baseParams The base Algolia parameters
   * @param naturalLanguageQuery The natural language query to enhance the search with
   * @returns The enhanced Algolia search parameters
   */
  async enhanceSearchParams(
    baseParams: AlgoliaSearchParams, 
    naturalLanguageQuery: string
  ): Promise<AlgoliaSearchParams> {
    try {
      info(`Enhancing search params with natural language: "${naturalLanguageQuery}"`, {
        baseParams
      });
      
      // Generate new parameters from the natural language query
      const newParams = await this.naturalLanguageToAlgoliaParams(naturalLanguageQuery);
      
      // Merge the parameters, with the new parameters taking precedence
      const enhancedParams: AlgoliaSearchParams = {
        ...baseParams,
        ...newParams
      };
      
      // Special handling for filters - combine them if both exist
      if (baseParams.filters && newParams.filters) {
        enhancedParams.filters = `(${baseParams.filters}) AND (${newParams.filters})`;
      }
      
      // Special handling for facetFilters - combine them if both exist
      if (baseParams.facetFilters && newParams.facetFilters) {
        if (Array.isArray(baseParams.facetFilters) && Array.isArray(newParams.facetFilters)) {
          // Handle the case where both are string arrays
          if (baseParams.facetFilters.every(f => typeof f === 'string') && 
              newParams.facetFilters.every(f => typeof f === 'string')) {
            enhancedParams.facetFilters = [
              ...(baseParams.facetFilters as string[]), 
              ...(newParams.facetFilters as string[])
            ];
          } 
          // Handle the case where both are string[][] (nested arrays)
          else if (baseParams.facetFilters.every(f => Array.isArray(f)) && 
                   newParams.facetFilters.every(f => Array.isArray(f))) {
            enhancedParams.facetFilters = [
              ...(baseParams.facetFilters as string[][]), 
              ...(newParams.facetFilters as string[][])
            ];
          }
        }
      }
      
      // Special handling for numericFilters - combine them if both exist
      if (baseParams.numericFilters && newParams.numericFilters) {
        if (Array.isArray(baseParams.numericFilters) && Array.isArray(newParams.numericFilters)) {
          // Handle the case where both are string arrays
          if (baseParams.numericFilters.every(f => typeof f === 'string') && 
              newParams.numericFilters.every(f => typeof f === 'string')) {
            enhancedParams.numericFilters = [
              ...(baseParams.numericFilters as string[]), 
              ...(newParams.numericFilters as string[])
            ];
          } 
          // Handle the case where both are string[][] (nested arrays)
          else if (baseParams.numericFilters.every(f => Array.isArray(f)) && 
                   newParams.numericFilters.every(f => Array.isArray(f))) {
            enhancedParams.numericFilters = [
              ...(baseParams.numericFilters as string[][]), 
              ...(newParams.numericFilters as string[][])
            ];
          }
        }
      }
      
      info(`Enhanced search params:`, enhancedParams);
      
      return enhancedParams;
    } catch (err: any) {
      error(`Failed to enhance search params: ${err.message}`, {
        baseParams,
        naturalLanguageQuery,
        error: err
      });
      
      // Return the base parameters unchanged
      return baseParams;
    }
  }
}

// Export a singleton instance
export const algoliaSearchService = new AlgoliaSearchService();
