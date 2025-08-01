import React, { useState, useEffect } from 'react';
import { Calendar, Star, Search, Filter, Download, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import RssFeedFetcher from '@/components/RssFeedFetcher';
import FileUploader from '@/components/FileUploader';

interface Review {
  date: string;
  rating: number;
  content: string;
  author: string;
  reviewUrl?: string;
  title?: string;
  id?: string;
}

interface PluginData {
  slug: string;
  name?: string; // Plugin display name
  reviews: Review[];
  lastUpdated: string;
  totalReviews: number;
}

const Index = () => {
  const [slugInput, setSlugInput] = useState('');
  const [plugins, setPlugins] = useState<PluginData[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState('');
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [selectedRating, setSelectedRating] = useState('');
  const [filteredReviews, setFilteredReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshingPlugin, setRefreshingPlugin] = useState<string>('');
  const [showRssFetcher, setShowRssFetcher] = useState(false);
  const [currentRssFeed, setCurrentRssFeed] = useState<string>('');
  const [currentPluginSlug, setCurrentPluginSlug] = useState<string>('');

  // Load plugins from localStorage on component mount
  useEffect(() => {
    const savedPlugins = localStorage.getItem('wordpress-plugins');
    if (savedPlugins) {
      setPlugins(JSON.parse(savedPlugins));
    }
  }, []);

  // Save plugins to localStorage whenever plugins state changes
  useEffect(() => {
    localStorage.setItem('wordpress-plugins', JSON.stringify(plugins));
  }, [plugins]);

  // Filter reviews based on selected criteria
  useEffect(() => {
    if (!selectedPlugin) {
      setFilteredReviews([]);
      return;
    }

    const plugin = plugins.find(p => p.slug === selectedPlugin);
    if (!plugin) return;

    let filtered = [...plugin.reviews];

    // Filter by date range
    if (startDate) {
      filtered = filtered.filter(review => new Date(review.date) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(review => new Date(review.date) <= endDate);
    }

    // Filter by rating
    if (selectedRating && selectedRating !== 'all') {
      filtered = filtered.filter(review => review.rating === parseInt(selectedRating));
    }

    setFilteredReviews(filtered);
  }, [selectedPlugin, startDate, endDate, selectedRating, plugins]);

  const fetchPluginInfo = async (slug: string) => {
    try {
      const response = await fetch(`https://api.wordpress.org/plugins/info/1.0/${slug}.json`);
      if (!response.ok) {
        throw new Error('Plugin not found');
      }
      const data = await response.json();
      return {
        name: data.name,
        exists: true
      };
    } catch (error) {
      return {
        name: null,
        exists: false
      };
    }
  };

  const formatPluginName = (slug: string) => {
    // Convert slug to title case
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const cleanPluginName = (name: string) => {
    if (!name) return name;
    
    // Remove HTML entities and extract main name before dash/hyphen
    let cleanName = name
      .replace(/&#8211;/g, '–') // Replace HTML entity with actual dash
      .replace(/&#8212;/g, '—') // Replace HTML entity with em dash
      .replace(/&amp;/g, '&')   // Replace HTML entity with ampersand
      .replace(/&lt;/g, '<')    // Replace HTML entity with less than
      .replace(/&gt;/g, '>')    // Replace HTML entity with greater than
      .replace(/&quot;/g, '"')  // Replace HTML entity with quote
      .replace(/&#39;/g, "'");  // Replace HTML entity with apostrophe
    
    // Split by various dash types and take the first part
    const parts = cleanName.split(/\s*[–—-]\s*/);
    return parts[0].trim();
  };

  const handleAddPlugin = async () => {
    if (!slugInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a plugin slug",
        variant: "destructive",
      });
      return;
    }

    const slug = slugInput.trim().toLowerCase();
    
    // Check if plugin already exists
    if (plugins.find(p => p.slug === slug)) {
      toast({
        title: "Error",
        description: "This plugin is already added",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    // Fetch plugin info to validate existence
    const pluginInfo = await fetchPluginInfo(slug);
    
    if (!pluginInfo.exists) {
      setIsLoading(false);
      toast({
        title: "Error",
        description: "This plugin doesn't exist on WordPress.org",
        variant: "destructive",
      });
      return;
    }

    // Set up RSS feed URL for the plugin
    const rssFeedUrl = `https://wordpress.org/support/plugin/${slug}/reviews/feed/`;
    setCurrentRssFeed(rssFeedUrl);
    setCurrentPluginSlug(slug);
    setShowRssFetcher(true);
    setSlugInput('');
  };

  const handleRefreshPlugin = (slug: string) => {
    const rssFeedUrl = `https://wordpress.org/support/plugin/${slug}/reviews/feed/`;
    setCurrentRssFeed(rssFeedUrl);
    setCurrentPluginSlug(slug);
    setRefreshingPlugin(slug);
    setShowRssFetcher(true);
  };

  const upsertReviews = (existingReviews: Review[], newReviews: Review[]): Review[] => {
    const reviewMap = new Map();
    
    // Add existing reviews to map
    existingReviews.forEach(review => {
      const key = review.id || `${review.author}-${review.date}-${review.content.substring(0, 50)}`;
      reviewMap.set(key, review);
    });
    
    // Add/update with new reviews
    newReviews.forEach(review => {
      const key = review.id || `${review.author}-${review.date}-${review.content.substring(0, 50)}`;
      reviewMap.set(key, review);
    });
    
    return Array.from(reviewMap.values());
  };

  const handleRssReviewsFetched = async (newReviews: Review[]) => {
    if (!currentPluginSlug) return;
    
    // Fetch plugin name
    const pluginInfo = await fetchPluginInfo(currentPluginSlug);
    const pluginName = pluginInfo.name ? cleanPluginName(pluginInfo.name) : formatPluginName(currentPluginSlug);
    
    const updatedPlugins = [...plugins];
    const existingIndex = updatedPlugins.findIndex(p => p.slug === currentPluginSlug);
    
    let finalReviews = newReviews;
    
    if (existingIndex >= 0) {
      // Upsert: merge new reviews with existing ones
      const existingReviews = updatedPlugins[existingIndex].reviews;
      finalReviews = upsertReviews(existingReviews, newReviews);
      
      updatedPlugins[existingIndex] = {
        ...updatedPlugins[existingIndex],
        name: pluginName,
        reviews: finalReviews,
        lastUpdated: new Date().toISOString(),
        totalReviews: finalReviews.length
      };
    } else {
      // New plugin
      const pluginData: PluginData = {
        slug: currentPluginSlug,
        name: pluginName,
        reviews: finalReviews,
        lastUpdated: new Date().toISOString(),
        totalReviews: finalReviews.length
      };
      updatedPlugins.push(pluginData);
    }

    setPlugins(updatedPlugins);
    setShowRssFetcher(false);
    setCurrentRssFeed('');
    setCurrentPluginSlug('');
    setIsLoading(false);
    setRefreshingPlugin('');
    
    const action = existingIndex >= 0 ? 'refreshed' : 'fetched';
    toast({
      title: "Success!",
      description: `${action} ${finalReviews.length} reviews for ${pluginName}`,
    });
  };

  const handleRssError = (error: string) => {
    toast({
      title: "Error",
      description: `Failed to fetch reviews: ${error}`,
      variant: "destructive",
    });
    setShowRssFetcher(false);
    setCurrentRssFeed('');
    setCurrentPluginSlug('');
    setIsLoading(false);
    setRefreshingPlugin('');
  };

  const handleRemovePlugin = (slug: string) => {
    const updatedPlugins = plugins.filter(p => p.slug !== slug);
    setPlugins(updatedPlugins);
    
    if (selectedPlugin === slug) {
      setSelectedPlugin('');
    }
    
    const pluginName = plugins.find(p => p.slug === slug)?.name || slug;
    toast({
      title: "Success",
      description: `Removed ${pluginName} from the list`,
    });
  };

  const exportData = () => {
    const dataStr = JSON.stringify(plugins, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'wordpress-plugin-reviews.json';
    link.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Success",
      description: "Reviews data exported successfully",
    });
  };

  const handleDataUpload = async (uploadedData: PluginData[]) => {
    const mergedPlugins = [...plugins];
    
    for (const uploadedPlugin of uploadedData) {
      const existingIndex = mergedPlugins.findIndex(p => p.slug === uploadedPlugin.slug);
      
      // Fetch plugin name if not present
      let pluginName = uploadedPlugin.name;
      if (!pluginName) {
        const pluginInfo = await fetchPluginInfo(uploadedPlugin.slug);
        pluginName = pluginInfo.name ? cleanPluginName(pluginInfo.name) : formatPluginName(uploadedPlugin.slug);
      } else {
        // Clean existing plugin name
        pluginName = cleanPluginName(pluginName);
      }
      
      if (existingIndex >= 0) {
        // Merge reviews using upsert logic
        const mergedReviews = upsertReviews(mergedPlugins[existingIndex].reviews, uploadedPlugin.reviews);
        mergedPlugins[existingIndex] = {
          ...mergedPlugins[existingIndex],
          name: pluginName,
          reviews: mergedReviews,
          totalReviews: mergedReviews.length,
          lastUpdated: new Date().toISOString()
        };
      } else {
        // Add new plugin
        mergedPlugins.push({
          ...uploadedPlugin,
          name: pluginName,
          lastUpdated: new Date().toISOString()
        });
      }
    }
    
    setPlugins(mergedPlugins);
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={cn(
          "w-4 h-4",
          i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
        )}
      />
    ));
  };

  return (
    // <div className="bg-white p-4" style={{ maxHeight: '750px', height: '750px' }}>
    <div className="bg-white p-4">
      <div className="max-w-7xl mx-auto h-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-black mb-2">
            WordPress Plugin Review Tracker
          </h1>
          <p className="text-lg text-gray-600">
            Fetch, store, and analyze WordPress plugin reviews with comprehensive data collection
          </p>
        </div>

        {/* <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full"> */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-screen">
          {/* Left Panel - Plugin Management */}
          <div className="lg:col-span-1 h-full">
            
            {/* Add Plugin using slug */}
            <Card className="mb-6 shadow-lg border border-gray-200">
              <CardHeader className="bg-white border-b border-gray-200 rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-black">
                  <Search className="w-5 h-5" />
                  Add Plugin
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 flex gap-2 items-end justify-between">
                <div>
                  <Label htmlFor="slug" className="text-sm font-medium text-gray-700">Plugin Slug</Label>
                  <Input
                    id="slug"
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value)}
                    placeholder="https://wp.org/plugins/{plugin-slug}/"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddPlugin()}
                    className="w-full inline-block focus-visible:ring-offset-0 focus-visible:ring-1"
                  />
                </div>
                <Button 
                  onClick={handleAddPlugin} 
                  disabled={isLoading}
                  className="bg-black hover:bg-gray-800 text-white"
                >
                  {isLoading ? 'Adding Plugin...' : 'Add Plugin'}
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-lg border border-gray-200 flex-1">

              {/* Added plugins section */}
              <CardHeader className="bg-white border-b border-gray-200 rounded-t-lg">
                <CardTitle className="flex items-center justify-between text-black">
                  <span>Added Plugins ({plugins.length})</span>
                  <div className="flex gap-2">
                    <div title="Upload plugin data">
                      <FileUploader onDataUploaded={handleDataUpload} />
                    </div>
                    {plugins.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportData}
                        title="Download plugin data"
                        className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>

              {/* Added plugins lists */}
              <CardContent className="p-6">
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {(isLoading || showRssFetcher) && (
                    <div className="text-center py-4">
                      <div className="flex items-center justify-center gap-2 text-black">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Fetching reviews...</span>
                      </div>
                    </div>
                  )}
                  {plugins.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No plugins added yet
                    </p>
                  ) : (
                    <>
                      {plugins.slice(0, 5).map((plugin) => (
                        <div
                          key={plugin.slug}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-black">{plugin.name || formatPluginName(plugin.slug)}</div>
                            <div className="text-sm text-gray-600">
                              {plugin.reviews.length} reviews stored
                            </div>
                            <div className="text-xs text-gray-400">
                              Last updated: {new Date(plugin.lastUpdated).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRefreshPlugin(plugin.slug)}
                              disabled={isLoading}
                              className="hover:bg-gray-200 hover:text-black"
                              title="Refresh reviews"
                            >
                              <RefreshCw className={cn("w-4 h-4", refreshingPlugin === plugin.slug && "animate-spin")} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemovePlugin(plugin.slug)}
                              className="hover:bg-red-50 hover:text-red-600"
                              title="Remove plugin"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {plugins.length > 5 && (
                        <>
                          {plugins.slice(5).map((plugin) => (
                            <div
                              key={plugin.slug}
                              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="font-semibold text-black">{plugin.name || formatPluginName(plugin.slug)}</div>
                                <div className="text-sm text-gray-600">
                                  {plugin.reviews.length} reviews stored
                                </div>
                                <div className="text-xs text-gray-400">
                                  Last updated: {new Date(plugin.lastUpdated).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRefreshPlugin(plugin.slug)}
                                  disabled={isLoading}
                                  className="hover:bg-gray-200 hover:text-black"
                                  title="Refresh reviews"
                                >
                                  <RefreshCw className={cn("w-4 h-4", refreshingPlugin === plugin.slug && "animate-spin")} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemovePlugin(plugin.slug)}
                                  className="hover:bg-red-50 hover:text-red-600"
                                  title="Remove plugin"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <div className="text-center py-2 bg-gray-100 rounded border-t">
                            <p className="text-xs text-gray-600 font-medium">
                              Showing {plugins.length} plugins • Scroll to see all
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Filtering and Results */}
          <div className="lg:col-span-2 h-full flex flex-col">
            {/* Hidden RSS Fetcher */}
            {showRssFetcher && currentRssFeed && (
              <div className="hidden">
                <RssFeedFetcher
                  feedUrl={currentRssFeed}
                  onReviewsFetched={handleRssReviewsFetched}
                  onError={handleRssError}
                />
              </div>
            )}

            {/* Filter Reviews section */}
            <Card className="mb-6 shadow-lg border border-gray-200">
              <CardHeader className="bg-white border-b border-gray-200 rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-black">
                  <Filter className="w-5 h-5" />
                  Filter Reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label>Plugin</Label>
                    <Select value={selectedPlugin} onValueChange={setSelectedPlugin} >
                      <SelectTrigger>
                        <SelectValue placeholder="Select plugin" />
                      </SelectTrigger>
                      <SelectContent>
                        {plugins.map((plugin) => (
                          <SelectItem key={plugin.slug} value={plugin.slug}>
                            {plugin.name || formatPluginName(plugin.slug)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "PPP") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "PPP") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label>Rating</Label>
                    <Select value={selectedRating} onValueChange={setSelectedRating}>
                      <SelectTrigger>
                        <SelectValue placeholder="All ratings" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All ratings</SelectItem>
                        <SelectItem value="5">5 stars</SelectItem>
                        <SelectItem value="4">4 stars</SelectItem>
                        <SelectItem value="3">3 stars</SelectItem>
                        <SelectItem value="2">2 stars</SelectItem>
                        <SelectItem value="1">1 star</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Reviews section */}
            {/* <Card className="shadow-lg border border-gray-200 flex-1 overflow-hidden"> */}
            <Card className="shadow-lg border border-gray-200 flex-1 max-h-full">
              <CardHeader className="bg-white border-b border-gray-200 rounded-t-lg">
                <CardTitle className="text-black">
                  Reviews ({filteredReviews.length})
                </CardTitle>
              </CardHeader>

              {/* <CardContent className="p-6 max-h-80 overflow-y-auto"> */}
              <CardContent className="p-6">
                {filteredReviews.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 text-lg">
                      {selectedPlugin 
                        ? "No reviews match your filter criteria" 
                        : "Select a plugin to view reviews"
                      }
                    </p>
                  </div>
                ) : (
                  // <div className="space-y-4 h-full overflow-y-auto">
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {filteredReviews.map((review, index) => (
                      <div
                        key={index}
                        className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow border-gray-200"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {renderStars(review.rating)}
                            <span className="text-sm text-gray-600 font-medium">
                              {review.rating}/5
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                              {review.date}
                            </span>
                            {review.reviewUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(review.reviewUrl, '_blank')}
                                className="hover:bg-gray-100 hover:text-black"
                                title="View original review"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="text-gray-700 text-sm leading-relaxed mb-3">
                          {review.content}
                        </p>
                        <div className="text-xs text-gray-500 font-medium">
                          by {review.author}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
