
import { useEffect, useState } from 'react';

interface Review {
  date: string;
  rating: number;
  content: string;
  author: string;
  reviewUrl?: string;
  title?: string;
}

interface ReviewPage {
  page: number;
  reviews: Review[];
}

interface ReviewFetcherProps {
  pluginSlug: string;
  totalReviews: number;
  onReviewsFetched: (reviews: Review[]) => void;
}

const ReviewFetcher = ({ pluginSlug, totalReviews, onReviewsFetched }: ReviewFetcherProps) => {
  const [reviewPages, setReviewPages] = useState<ReviewPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState<string>('');

  // Calculate total pages (30 reviews per page based on WordPress.org structure)
  const totalPages = Math.ceil(totalReviews / 30);

  useEffect(() => {
    const fetchAllPages = async () => {
      const fetchedPages: ReviewPage[] = [];
      setError('');
      
      for (let page = 1; page <= Math.min(totalPages, 10); page++) { // Limit to 10 pages for testing
        setCurrentPage(page);
        
        try {
          // Use cors-anywhere proxy
          const pageUrl = `https://wordpress.org/support/plugin/${pluginSlug}/reviews/page/${page}/`;
          const proxyUrl = `https://cors-anywhere.herokuapp.com/${pageUrl}`;
          
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (!response.ok) {
            console.warn(`Failed to fetch page ${page}: ${response.status}`);
            continue;
          }
          
          const htmlContent = await response.text();
          
          // Parse HTML content
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');
          
          // Use the correct selector from the reference code
          const reviewElements = doc.querySelectorAll('.bbp-topic');
          console.log(`Found ${reviewElements.length} reviews on page ${page}`);
          
          const pageReviews: Review[] = [];
          
          reviewElements.forEach((reviewEl, index) => {
            try {
              // Extract rating using the wporg-ratings class
              let rating = 5; // Default rating
              const ratingElement = reviewEl.querySelector('.wporg-ratings');
              if (ratingElement) {
                const ratingText = ratingElement.textContent?.trim() || '';
                const ratingMatch = ratingText.match(/(\d)\s*(?:out of|\/)\s*5/i);
                if (ratingMatch) {
                  rating = parseInt(ratingMatch[1]);
                }
              }
              
              // Extract title using bbp-topic-title
              let title = '';
              const titleElement = reviewEl.querySelector('.bbp-topic-title');
              if (titleElement) {
                title = titleElement.textContent?.trim() || '';
              }
              
              // Extract review link
              let reviewUrl = '';
              const linkElement = reviewEl.querySelector('.bbp-topic-title a');
              if (linkElement) {
                const href = linkElement.getAttribute('href');
                if (href) {
                  reviewUrl = href.startsWith('http') ? href : `https://wordpress.org${href}`;
                }
              }
              
              // Extract author from topic meta
              let author = 'Anonymous';
              const authorElement = reviewEl.querySelector('.bbp-topic-meta .bbp-topic-started-by');
              if (authorElement) {
                author = authorElement.textContent?.trim().replace('Started by:', '').trim() || 'Anonymous';
              }
              
              // Extract date from topic meta
              let date = new Date().toISOString().split('T')[0];
              const dateElement = reviewEl.querySelector('.bbp-topic-meta .bbp-topic-started-in');
              if (dateElement) {
                const dateText = dateElement.textContent?.trim() || '';
                const dateMatch = dateText.match(/(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                  date = dateMatch[1];
                } else {
                  // Try to parse relative date
                  const relativeMatch = dateText.match(/(\d+)\s+(weeks?|months?|days?|years?)\s+ago/i);
                  if (relativeMatch) {
                    const amount = parseInt(relativeMatch[1]);
                    const unit = relativeMatch[2].toLowerCase();
                    const now = new Date();
                    
                    if (unit.includes('day')) {
                      now.setDate(now.getDate() - amount);
                    } else if (unit.includes('week')) {
                      now.setDate(now.getDate() - (amount * 7));
                    } else if (unit.includes('month')) {
                      now.setMonth(now.getMonth() - amount);
                    } else if (unit.includes('year')) {
                      now.setFullYear(now.getFullYear() - amount);
                    }
                    
                    date = now.toISOString().split('T')[0];
                  }
                }
              }
              
              // Use title as content if available, otherwise look for other content
              let content = title || '';
              if (!content) {
                const contentElement = reviewEl.querySelector('.bbp-topic-content, .entry-content');
                if (contentElement) {
                  content = contentElement.textContent?.trim() || '';
                }
              }
              
              if (content && content.length > 10 && rating > 0) {
                pageReviews.push({
                  date,
                  rating,
                  content: content.substring(0, 1000), // Limit content length
                  author: author.substring(0, 100), // Limit author length
                  reviewUrl,
                  title: title.substring(0, 200) // Limit title length
                });
                console.log(`Parsed review ${pageReviews.length}: ${content.substring(0, 100)}...`);
              }
              
            } catch (error) {
              console.warn(`Error parsing review ${index} on page ${page}:`, error);
            }
          });
          
          fetchedPages.push({ page, reviews: pageReviews });
          
          // Add delay to be respectful to the server
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`Error fetching page ${page}:`, error);
          if (page === 1) {
            setError('Failed to fetch reviews. Please try enabling CORS in your browser or use a CORS extension.');
          }
        }
      }

      setReviewPages(fetchedPages);
      setLoading(false);
      setCurrentPage(0);
      
      // Call the callback with all reviews
      const allReviews = fetchedPages.flatMap(page => page.reviews);
      onReviewsFetched(allReviews);
    };

    if (pluginSlug && totalReviews > 0) {
      fetchAllPages();
    }
  }, [pluginSlug, totalReviews, totalPages, onReviewsFetched]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-lg">Loading reviews for {pluginSlug}...</p>
        <p className="text-sm text-gray-600">
          Fetching page {currentPage} of {Math.min(totalPages, 10)} ({totalReviews} total reviews)
        </p>
        <p className="text-xs text-yellow-600 mt-2">
          Note: If this fails, you may need to visit https://cors-anywhere.herokuapp.com/corsdemo and request temporary access.
        </p>
        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}
      </div>
    );
  }

  const allReviews = reviewPages.flatMap(page => page.reviews);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-green-600">
        ✅ Successfully fetched {allReviews.length} reviews from {reviewPages.length} pages
      </h3>
      
      <div className="grid gap-4 max-h-96 overflow-y-auto">
        {allReviews.slice(0, 5).map((review, index) => (
          <div key={index} className="border rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={`text-lg ${
                        i < review.rating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <span className="text-sm text-gray-600">{review.rating}/5</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{review.date}</span>
                {review.reviewUrl && (
                  <a
                    href={review.reviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    View Original
                  </a>
                )}
              </div>
            </div>
            {review.title && review.title !== review.content && (
              <h4 className="font-semibold text-gray-800 mb-2">{review.title}</h4>
            )}
            <p className="text-gray-700 text-sm leading-relaxed mb-2">
              {review.content}
            </p>
            <div className="text-xs text-gray-500">by {review.author}</div>
          </div>
        ))}
        {allReviews.length > 5 && (
          <p className="text-sm text-gray-500 text-center">
            ... and {allReviews.length - 5} more reviews
          </p>
        )}
      </div>
    </div>
  );
};

export default ReviewFetcher;
