
import { useEffect, useState } from 'react';

interface Review {
  date: string;
  rating: number;
  content: string;
  author: string;
  reviewUrl?: string;
  title?: string;
  id?: string;
}

interface RssFeedFetcherProps {
  feedUrl: string;
  onReviewsFetched: (reviews: Review[]) => void;
  onError: (error: string) => void;
}

const RssFeedFetcher = ({ feedUrl, onReviewsFetched, onError }: RssFeedFetcherProps) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRssReviews = async () => {
      try {
        setLoading(true);
        
        // Try multiple CORS proxy services
        const proxyUrls = [
          `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`,
          `https://corsproxy.io/?${encodeURIComponent(feedUrl)}`,
          `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(feedUrl)}`
        ];
        
        let response;
        let lastError;
        
        for (const proxyUrl of proxyUrls) {
          try {
            console.log(`Trying proxy: ${proxyUrl}`);
            response = await fetch(proxyUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
              }
            });
            
            if (response.ok) {
              console.log(`Successfully connected using: ${proxyUrl}`);
              break;
            } else {
              throw new Error(`HTTP ${response.status}`);
            }
          } catch (error) {
            console.log(`Failed with proxy ${proxyUrl}:`, error);
            lastError = error;
            continue;
          }
        }
        
        if (!response || !response.ok) {
          throw new Error(`All proxy services failed. Last error: ${lastError?.message || 'Unknown error'}`);
        }
        
        const xmlText = await response.text();
        console.log('Received XML data, length:', xmlText.length);
        
        // Parse XML content
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Check for parsing errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
          throw new Error('Failed to parse RSS feed XML');
        }
        
        const items = xmlDoc.querySelectorAll('item');
        const reviews: Review[] = [];
        
        console.log(`Found ${items.length} items in RSS feed`);
        
        items.forEach((item, index) => {
          try {
            // Extract title
            const titleEl = item.querySelector('title');
            const title = titleEl?.textContent?.trim() || '';
            
            // Extract content/description and clean it thoroughly
            const descEl = item.querySelector('description');
            let content = descEl?.textContent?.trim() || title;
            
            // Remove HTML tags and clean up content
            content = content
              .replace(/<[^>]*>/g, '') // Remove all HTML tags
              .replace(/&[^;]+;/g, ' ') // Remove HTML entities
              .replace(/\s+/g, ' ') // Replace multiple spaces with single space
              .replace(/Replies:\s*\d+\s*Rating:\s*\d+\s*stars?/gi, '') // Remove "Replies: X Rating: X stars"
              .replace(/Rating:\s*\d+\s*stars?\s*Replies:\s*\d+/gi, '') // Remove "Rating: X stars Replies: X"
              .trim();
            
            // Extract author
            const authorEl = item.querySelector('dc\\:creator, creator');
            const author = authorEl?.textContent?.trim() || 'Anonymous';
            
            // Extract date
            const dateEl = item.querySelector('pubDate');
            let date = new Date().toISOString().split('T')[0];
            if (dateEl?.textContent) {
              const parsedDate = new Date(dateEl.textContent);
              if (!isNaN(parsedDate.getTime())) {
                date = parsedDate.toISOString().split('T')[0];
              }
            }
            
            // Extract link
            const linkEl = item.querySelector('link');
            const reviewUrl = linkEl?.textContent?.trim() || '';
            
            // Extract rating (look for rating in title or content)
            let rating = 5; // Default rating
            const ratingMatch = (title + ' ' + content).match(/(\d)\s*(?:out of|\/)\s*5|(\d)\s*star/i);
            if (ratingMatch) {
              rating = parseInt(ratingMatch[1] || ratingMatch[2]);
            }
            
            // Create unique ID for upsert functionality
            const id = `${author}-${date}-${index}`;
            
            if (content && content.length > 10) {
              reviews.push({
                id,
                date,
                rating,
                content: content.substring(0, 1000),
                author: author.substring(0, 100),
                reviewUrl,
                title: title.substring(0, 200)
              });
            }
            
          } catch (error) {
            console.warn(`Error parsing RSS item ${index}:`, error);
          }
        });
        
        console.log(`Successfully parsed ${reviews.length} reviews from RSS feed`);
        onReviewsFetched(reviews);
        
      } catch (error) {
        console.error('Error fetching RSS reviews:', error);
        onError(error instanceof Error ? error.message : 'Failed to fetch RSS reviews');
      } finally {
        setLoading(false);
      }
    };

    if (feedUrl) {
      fetchRssReviews();
    }
  }, [feedUrl, onReviewsFetched, onError]);

  return null;
};

export default RssFeedFetcher;
