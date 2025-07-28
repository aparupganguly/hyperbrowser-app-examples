import { Hyperbrowser } from "@hyperbrowser/sdk";
import { getSession, releaseSession } from "./session-cache";

interface ResearchConfig {
  query: string;
  location?: string;
  maxPages?: number;
  extractSchema?: any;
  sessionTimeout?: number;
}

interface ResearchResult {
  query: string;
  totalPages: number;
  extractedData: any[];
  metadata: {
    sessionId: string;
    duration: number;
    sources: string[];
  };
}

/**
 * Deep Research API - Chains Hyperbrowser session, crawl, and extract
 * 
 * 1. Start persistent session
 * 2. Crawl target sites for research topics  
 * 3. Extract structured data from relevant pages
 * 4. Return clean JSON results
 */
export async function deepResearch(
  hb: Hyperbrowser, 
  config: ResearchConfig
): Promise<ResearchResult> {
  const startTime = Date.now();
  const sources: string[] = [];
  const extractedData: any[] = [];
  
  console.log(`🔬 Starting FAST deep research: "${config.query}"`);
  
  // Step 1: Get reusable session for SPEED (with fallback)
  let sessionId: string;
  try {
    sessionId = await getSession(hb);
    console.log(`⚡ Using cached session: ${sessionId}`);
  } catch (error) {
    console.log(`⚠️ Session cache failed, creating direct session...`);
    const directSession = await hb.sessions.create({});
    sessionId = directSession.id;
    console.log(`🆕 Created direct session: ${sessionId}`);
  }
  
  try {
    // Step 2: PARALLEL multi-site strategy for speed
    const researchTargets = buildResearchTargets(config.query, config.location);
    console.log(`🚀 PARALLEL targeting ${researchTargets.length} sources: ${researchTargets.map(t => t.name).join(', ')}`);
    
    // PARALLEL scraping with Hyperbrowser for maximum speed
    const scrapePromises = researchTargets.map(async (target, i) => {
      console.log(`🕷️ [${i+1}/${researchTargets.length}] Starting: ${target.name}`);
      
      try {
         // Use faster scrape.startAndWait instead of crawl+extract
         const scrapeResult = await hb.scrape.startAndWait({
           url: target.url,
           scrapeOptions: { 
             formats: ["html", "markdown"],
             timeout: 15000 // 15s timeout for speed
           }
         });
        
        console.log(`✅ ${target.name}: Scraped successfully`);
        
        if (scrapeResult.data?.html || scrapeResult.data?.markdown) {
          sources.push(target.name);
          
           // Fast extraction using Hyperbrowser extract
           const extractResult = await hb.extract.startAndWait({
             urls: [target.url],
             schema: config.extractSchema || getDefaultSchema(target.type)
           });
          
          if (extractResult.data) {
            extractedData.push({
              source: target.name,
              url: target.url,
              data: extractResult.data,
              timestamp: new Date().toISOString()
            });
            console.log(`🎯 ${target.name}: Data extracted`);
          }
        }
        
        return { success: true, source: target.name };
      } catch (error) {
        console.error(`❌ ${target.name} failed:`, error);
        return { success: false, source: target.name, error };
      }
    });
    
    // Wait for ALL parallel operations to complete
    console.log(`⚡ Running ${scrapePromises.length} parallel Hyperbrowser operations...`);
    const results = await Promise.allSettled(scrapePromises);
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`🏁 Parallel complete: ${successful}/${results.length} sources successful`);
    
    return {
      query: config.query,
      totalPages: extractedData.length,
      extractedData,
      metadata: {
        sessionId: sessionId,
        duration: Date.now() - startTime,
        sources
      }
    };
    
  } finally {
    // Clean up session properly
    try {
      releaseSession(sessionId);
      console.log(`⚡ FAST research complete: ${extractedData.length} results in ${Date.now() - startTime}ms`);
    } catch (error) {
      // If session cache fails, stop the session directly
      console.log(`🧹 Cleaning up direct session: ${sessionId}`);
      try {
        await hb.sessions.stop(sessionId);
      } catch (stopError) {
        console.warn(`⚠️ Failed to stop session ${sessionId}:`, stopError);
      }
    }
  }
}

/**
 * Build FAST research targets optimized for Hyperbrowser performance
 */
function buildResearchTargets(query: string, location?: string) {
  const targets = [];
  
  // OPTIMIZED targets for speed + Hyperbrowser compatibility
  if (location) {
    targets.push({
      name: "Yelp Business",
      type: "business",
      url: `https://www.yelp.com/search?find_desc=${encodeURIComponent(query)}&find_loc=${encodeURIComponent(location)}`
    });
    
    targets.push({
      name: "Google Maps",
      type: "business", 
      url: `https://www.google.com/maps/search/${encodeURIComponent(`${query} near ${location}`)}`
    });
    
    targets.push({
      name: "Yellow Pages",
      type: "directory",
      url: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`
    });
  }
  
  // Add Craigslist only for marketplace-type queries
  if (location && (query.includes('for sale') || query.includes('furniture') || query.includes('equipment'))) {
    targets.push({
      name: "Craigslist",
      type: "marketplace", 
      url: `https://${getCraigslistSubdomain(location)}.craigslist.org/search/sss?query=${encodeURIComponent(query)}`
    });
  }
  
  return targets;
}

/**
 * Get Craigslist subdomain for major cities (for speed)
 */
function getCraigslistSubdomain(location: string): string {
  const cityMap: Record<string, string> = {
    'austin': 'austin',
    'newyork': 'newyork', 
    'new york': 'newyork',
    'chicago': 'chicago',
    'san francisco': 'sfbay',
    'los angeles': 'losangeles',
    'miami': 'miami',
    'seattle': 'seattle',
    'boston': 'boston',
    'denver': 'denver'
  };
  
  const normalized = location.toLowerCase().trim();
  return cityMap[normalized] || 'craigslist'; // fallback to main site
}

/**
 * Default extraction schemas by target type (JSON Schema format)
 */
function getDefaultSchema(targetType: string) {
  const schemas = {
    marketplace: {
      type: "object",
      properties: {
        listings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              price: { type: "string" },
              location: { type: "string" },
              contact: { type: "string" },
              description: { type: "string" }
            }
          }
        }
      }
    },
    
    business: {
      type: "object", 
      properties: {
        businesses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              address: { type: "string" },
              phone: { type: "string" },
              website: { type: "string" },
              rating: { type: "number" },
              category: { type: "string" }
            }
          }
        }
      }
    },
    
    directory: {
      type: "object",
      properties: {
        entries: {
          type: "array", 
          items: {
            type: "object",
            properties: {
              businessName: { type: "string" },
              address: { type: "string" },
              phoneNumber: { type: "string" },
              website: { type: "string" },
              category: { type: "string" }
            }
          }
        }
      }
    }
  };
  
  return schemas[targetType as keyof typeof schemas] || schemas.business;
}

/**
 * Simple sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * FAST Lead-specific research wrapper - Optimized for speed
 */
export async function findLeads(
  hb: Hyperbrowser,
  query: string, 
  location: string
) {
  return deepResearch(hb, {
    query,
    location,
    maxPages: 1, // Single page for speed
    sessionTimeout: 10, // Shorter timeout
    extractSchema: {
      type: "object",
      properties: {
        businesses: {
          type: "array",
          description: `ONLY extract businesses that specifically match: "${query}". Do NOT include restaurants, bars, or unrelated businesses.`,
          items: {
            type: "object",
            properties: {
              name: { 
                type: "string", 
                description: `Business name that specifically provides: ${query}` 
              },
              phone: { type: "string", description: "Phone number" },
              address: { type: "string", description: "Full address" },
              website: { type: "string", description: "Website URL" },
              email: { type: "string", description: "Email address" },
              category: { 
                type: "string", 
                description: `Business category related to: ${query}` 
              },
              description: { 
                type: "string", 
                description: `Description of how this business relates to: ${query}` 
              },
              relevanceScore: {
                type: "number",
                description: "Relevance score 1-10 for how well this matches the query"
              }
            },
            required: ["name", "category", "relevanceScore"]
          }
        }
      }
    }
  });
} 