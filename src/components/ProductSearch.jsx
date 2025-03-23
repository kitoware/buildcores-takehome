import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './ProductSearch.css';

const BUILD_CORES_API_URL = 'https://www.api.buildcores.com/api/official/database/parts';

// Constants for price range slider
const MIN_PRICE = 0;
const MAX_PRICE = 2000;
const STEP = 10;
const PRODUCTS_PER_PAGE = 20;

// Log the PRODUCTS_PER_PAGE constant on component initialization
console.log(`PRODUCTS_PER_PAGE is set to: ${PRODUCTS_PER_PAGE}`);

const ProductSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [compareItems, setCompareItems] = useState([]); // State for comparison items
  const [showComparison, setShowComparison] = useState(false); // State to toggle comparison panel
  const [showCompareModal, setShowCompareModal] = useState(false); // State to toggle comparison modal
  
  // Track refs for handling loading and preventing duplicate searches
  const isLoadingRef = useRef(false);
  const lastSearchTimeRef = useRef(0);
  const firstMountRef = useRef(true);
  
  // Temporary inputs state for handling typing without triggering search
  const [tempInputs, setTempInputs] = useState({
    minPrice: MIN_PRICE,
    maxPrice: MAX_PRICE
  });
  
  // Actual filters that trigger search (only updated when typing is complete)
  const [filters, setFilters] = useState({
    minPrice: MIN_PRICE,
    maxPrice: MAX_PRICE
  });

  // Memoize the search function with stable dependencies
  const searchProducts = useCallback(async (page = 1, force = false) => {
    // Use ref to track loading state to avoid state timing issues
    if (isLoadingRef.current && !force) {
      console.log('Search already in progress, skipping');
      return;
    }
    
    // Prevent rapid consecutive searches using ref
    const now = Date.now();
    if (!force && now - lastSearchTimeRef.current < 500) {
      console.log('Search too soon after last search, skipping');
      return;
    }
    
    try {
      console.log(`Starting search for page ${page}`);
      isLoadingRef.current = true;
      setLoading(true);
      setError(null);
      lastSearchTimeRef.current = now;
      
      // Clear typing indicator and timeout
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        setTypingTimeout(null);
      }
      setIsTyping(false);
  
      // Request significantly more products to ensure we have enough for multiple pages
      const requestLimit = PRODUCTS_PER_PAGE * 50; // Increase to request 50 pages worth of products
      
      const payload = {
        part_category: "PCCase",
        limit: requestLimit,
        skip: 0, // Always start from the beginning since we'll paginate client-side after filtering
        sort: 0,
        filters: [],
        search_query: searchQuery || "",
        show_disabled_interactive_models: true,
        show_interactive_first: false,
        include_count: true
      };
  
      // Handle price filtering in API request
      if (filters.minPrice > MIN_PRICE || filters.maxPrice < MAX_PRICE) {
        const priceFilter = {};
        
        if (filters.minPrice > MIN_PRICE) {
          priceFilter.price_gte = parseInt(filters.minPrice, 10);
        }
        
        if (filters.maxPrice < MAX_PRICE) {
          priceFilter.price_lte = parseInt(filters.maxPrice, 10);
        }
        
        payload.filters.push(priceFilter);
      }
  
      console.log('Searching with payload:', JSON.stringify(payload, null, 2));
  
      const response = await axios.post(BUILD_CORES_API_URL, payload, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });
  
      console.log('Build Cores API response received');
  
      // Get products from the response
      let receivedProducts = response.data.data || [];
      console.log(`Received ${receivedProducts.length} products from API`);

      // Make sure receivedProducts is valid and an array
      if (!Array.isArray(receivedProducts)) {
        console.error('API did not return an array of products:', receivedProducts);
        receivedProducts = [];
      }
      
      // Handle total count from API
      let totalProductCount;
      if (response.data.count !== undefined) {
        // If the API provides a count, use it directly
        totalProductCount = response.data.count;
        console.log(`Using API-provided count: ${totalProductCount}`);
      } else {
        // Default to a reasonable number if no count is provided
        totalProductCount = 3220; // Known approximate number of products
        console.log(`No count from API, using default count: ${totalProductCount}`);
      }
      
      // Client-side filtering for price
      let filteredProducts = receivedProducts;
      if (filters.minPrice > MIN_PRICE || filters.maxPrice < MAX_PRICE) {
        console.log('Applying price filter:', filters.minPrice, '-', filters.maxPrice);
        filteredProducts = receivedProducts.filter(product => {
          // Check if the product has a price
          if (!product.v2_lowest_prices?.US) {
            // Include products with missing price data in the results
            // This prevents products from being filtered out due to missing data
            return true;
          }
          
          const price = product.v2_lowest_prices.US;
          
          // Check if the price is within the specified range
          return (
            price >= filters.minPrice && 
            price <= filters.maxPrice
          );
        });
        
        console.log(`Price filtering: ${receivedProducts.length} products → ${filteredProducts.length} products`);
        
        // If we're applying filters, adjust the total count appropriately
        if (filters.minPrice > MIN_PRICE || filters.maxPrice < MAX_PRICE || searchQuery) {
          // Scale the count based on the filtering ratio
          const filterRatio = filteredProducts.length / receivedProducts.length;
          totalProductCount = Math.round(totalProductCount * filterRatio);
          console.log(`Adjusted count after filtering: ${totalProductCount}`);
        }
      }
      
      // Set the total count for UI display
      setTotalCount(totalProductCount);
      
      // If we received fewer products than expected, try to fetch more
      if (filteredProducts.length < PRODUCTS_PER_PAGE * 20 && filteredProducts.length < totalProductCount) {
        console.log(`Received fewer products (${filteredProducts.length}) than needed for proper pagination. Consider increasing fetch limit.`);
      }
      
      // Calculate pagination
      const startIndex = (page - 1) * PRODUCTS_PER_PAGE;
      let endIndex = Math.min(startIndex + PRODUCTS_PER_PAGE, filteredProducts.length);
      
      // Get the products for the current page
      const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
      console.log(`Page ${page} products: requesting index ${startIndex} to ${endIndex-1}, got ${paginatedProducts.length} products`);
      
      // This is where we check for empty pages
      if (paginatedProducts.length === 0 && page > 1) {
        const newPage = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE) || 1;
        setCurrentPage(newPage);
        
        // Recalculate pagination for the new page
        const newStartIndex = (newPage - 1) * PRODUCTS_PER_PAGE;
        const newEndIndex = Math.min(newStartIndex + PRODUCTS_PER_PAGE, filteredProducts.length);
        const newPaginatedProducts = filteredProducts.slice(newStartIndex, newEndIndex);
        console.log(`Adjusted to page ${newPage}, got ${newPaginatedProducts.length} products`);
        
        setProducts(newPaginatedProducts);
      } else {
        setProducts(paginatedProducts);
      }
  
      if (filteredProducts.length === 0) {
        const hasFilters = 
          searchQuery.trim() !== '' || 
          filters.minPrice > MIN_PRICE ||
          filters.maxPrice < MAX_PRICE;

        if (hasFilters) {
          setError('No products found matching your criteria. Try adjusting your filters.');
        } else {
          setError('No products found.');
        }
        
        setTotalCount(0);
      } else {
        setError(null);
      }
    } catch (err) {
      console.error('Search error:', err);
      if (err.code === 'ECONNABORTED') {
        setError('Request timed out. Please try again.');
      } else if (!err.response) {
        setError('Cannot connect to server. Please check your connection.');
      } else {
        setError(
          err.response?.data?.error ||
          'Failed to fetch products. Please try again.'
        );
      }
      setTotalCount(0);
      setProducts([]);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  // Include filters in the dependency array to ensure up-to-date values
  }, [filters, searchQuery]);  

  // Handle page change with updated reference to searchProducts
  const handlePageChange = useCallback((newPage) => {
    if (newPage === currentPage) return;
    
    console.log(`Changing to page ${newPage}`);
    setCurrentPage(newPage);
    searchProducts(newPage);
    
    // Scroll to top of results
    const resultsElement = document.querySelector('.products-grid');
    if (resultsElement) {
      window.scrollTo({ top: resultsElement.offsetTop - 20, behavior: 'smooth' });
    }
  }, [searchProducts, currentPage]);

  // Single effect for initial search and filter changes
  useEffect(() => {
    // Skip on first mount for filter changes
    if (firstMountRef.current) {
      // Initial search
      console.log('Running initial search');
      // Make sure the initialFilters are reset to defaults for first load
      setFilters({
        minPrice: MIN_PRICE,
        maxPrice: MAX_PRICE
      });
      // Reset temp inputs too to ensure consistency
      setTempInputs({
        minPrice: MIN_PRICE,
        maxPrice: MAX_PRICE
      });
      searchProducts(1, true);
      firstMountRef.current = false;
      return;
    }
    
    // For filter changes, wait a bit to avoid race conditions
    console.log('Filters changed, scheduling search');
    const timeoutId = setTimeout(() => {
      if (!isLoadingRef.current) {
        console.log('Executing filter change search');
        setCurrentPage(1);
        searchProducts(1);
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [filters, searchProducts]);

  // Typing detection handler with closure over current filters
  const handleTyping = () => {
    if (isLoadingRef.current) return;
    
    setIsTyping(true);
    
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    const newTimeout = setTimeout(() => {
      setIsTyping(false);
      // Apply temp inputs to actual filters when typing stops
      setFilters(prevFilters => {
        // Only update if values actually changed
        if (prevFilters.minPrice !== tempInputs.minPrice || 
            prevFilters.maxPrice !== tempInputs.maxPrice) {
          console.log('Applying price filter changes:', tempInputs.minPrice, '-', tempInputs.maxPrice);
          return {
            minPrice: tempInputs.minPrice,
            maxPrice: tempInputs.maxPrice
          };
        }
        return prevFilters;
      });
    }, 500); // Reduce timeout for faster response
    
    setTypingTimeout(newTimeout);
  };

  // Search button handler
  const handleSearch = (e) => {
    e.preventDefault();
    
    if (isLoadingRef.current) {
      console.log('Search already in progress');
      return;
    }
    
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }
    setIsTyping(false);
    
    // Apply current temp inputs
    console.log('Search button clicked, applying price filters:', tempInputs.minPrice, '-', tempInputs.maxPrice);
    setFilters({
      minPrice: tempInputs.minPrice,
      maxPrice: tempInputs.maxPrice
    });
    setCurrentPage(1);
    
    // Force search immediately
    setTimeout(() => {
      searchProducts(1, true);
    }, 0);
  };

  // Rest of the component remains the same
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    
    if (isLoadingRef.current) return;
    
    setTempInputs(prev => ({
      ...prev,
      [name]: value
    }));
    
    handleTyping();
  };

  // Handle price slider changes
  const handleMinPriceChange = (e) => {
    if (isLoadingRef.current) return;
    
    const value = parseInt(e.target.value, 10);
    
    if (value <= tempInputs.maxPrice) {
      setTempInputs(prev => ({
        ...prev,
        minPrice: value
      }));
      
      handleTyping();
    }
  };

  const handleMaxPriceChange = (e) => {
    if (isLoadingRef.current) return;
    
    const value = parseInt(e.target.value, 10);
    
    if (value >= tempInputs.minPrice) {
      setTempInputs(prev => ({
        ...prev,
        maxPrice: value
      }));
      
      handleTyping();
    }
  };

  // Format price to display with comma separators
  const formatPrice = (price) => {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Calculate the left position for the active track
  const getLeftPosition = () => {
    if (tempInputs.minPrice === MIN_PRICE) {
      return '0%';
    }
    const percentage = (tempInputs.minPrice / MAX_PRICE) * 100;
    return `${percentage}%`;
  };

  // Calculate the width of the active track
  const getTrackWidth = () => {
    if (tempInputs.minPrice === MIN_PRICE) {
      return `${(tempInputs.maxPrice / MAX_PRICE) * 100}%`;
    }
    const percentage = ((tempInputs.maxPrice - tempInputs.minPrice) / MAX_PRICE) * 100;
    return `${percentage}%`;
  };

  // Create a skeleton card for loading state
  const SkeletonCard = () => (
    <div className="product-card skeleton-card">
      <div className="skeleton-image skeleton"></div>
      <div className="product-details">
        <div className="skeleton-title skeleton"></div>
        <div className="skeleton-manufacturer skeleton"></div>
        <div className="price-container">
          <div className="skeleton-price skeleton"></div>
        </div>
      </div>
    </div>
  );

  // Generate skeleton cards
  const renderSkeletonCards = () => {
    return Array(PRODUCTS_PER_PAGE).fill().map((_, index) => (
      <SkeletonCard key={`skeleton-${index}`} />
    ));
  };

  // Calculate total number of pages based on total count
  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCTS_PER_PAGE));
  
  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = 5; // Show at most 5 page numbers
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    
    return pageNumbers;
  };

  // Render pagination controls
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    const pageNumbers = getPageNumbers();
    
    return (
      <div className="pagination">
        <button 
          className="pagination-button" 
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
        >
          &laquo; First
        </button>
        
        <button 
          className="pagination-button" 
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          &lt; Prev
        </button>
        
        {pageNumbers.map(number => (
          <button
            key={number}
            onClick={() => handlePageChange(number)}
            className={`pagination-button ${currentPage === number ? 'active' : ''}`}
          >
            {number}
          </button>
        ))}
        
        <button 
          className="pagination-button" 
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Next &gt;
        </button>
        
        <button 
          className="pagination-button" 
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
        >
          Last &raquo;
        </button>
      </div>
    );
  };

  // Handle adding/removing item to/from comparison
  const handleToggleCompare = (product) => {
    // Check if product is already in comparison
    if (compareItems.some(item => item.buildcores_id === product.buildcores_id)) {
      // Remove product from comparison
      handleRemoveFromCompare(product.buildcores_id);
    } else {
      // Add product to comparison - removed maximum check to allow unlimited items
      setCompareItems(prevItems => {
        // Add new product to comparison
        const newItems = [...prevItems, product];
        
        // Auto-show comparison panel when first item added
        if (newItems.length === 1) {
          setShowComparison(true);
        }
        
        return newItems;
      });
    }
  };

  // Handle removing item from comparison
  const handleRemoveFromCompare = (productId) => {
    setCompareItems(prevItems => 
      prevItems.filter(item => item.buildcores_id !== productId)
    );
  };

  // Clear all comparison items
  const clearCompareItems = () => {
    setCompareItems([]);
  };

  // Toggle comparison panel visibility
  const toggleComparison = () => {
    setShowComparison(prev => !prev);
  };

  // Toggle comparison modal visibility
  const toggleCompareModal = () => {
    const newState = !showCompareModal;
    setShowCompareModal(newState);
    
    // Add or remove modal-open class to body to prevent background scrolling
    if (newState) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  };

  // Use effect to clean up body class when component unmounts
  useEffect(() => {
    // Cleanup function to remove the class when component unmounts
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);

  return (
    <div className="product-search-container">
      <form onSubmit={handleSearch} className="search-form">

        <div className="search-box">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleTyping();
            }}
            placeholder="Search for PC cases..."
            className="search-input"
            aria-label="Search for PC cases"
            disabled={loading}
          />
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="filters">
          {/* Price Range Slider Group */}
          <div className="price-range-group">
            <div className="price-range-label">
              <span className="label-text">Price Range</span>
              <span className="price-range-current">
                ${formatPrice(tempInputs.minPrice)} - ${formatPrice(tempInputs.maxPrice)}
              </span>
            </div>
            
            <div className="price-slider-container">
              {/* Background track */}
              <div className="slider-track"></div>
              
              {/* Active track between handles */}
              <div 
                className="slider-track-active" 
                style={{ 
                  left: getLeftPosition(),
                  width: getTrackWidth()
                }}
              ></div>
              
              {/* Min Price Handle */}
              <input
                type="range"
                id="minPrice"
                name="minPrice"
                min={MIN_PRICE}
                max={MAX_PRICE}
                step={STEP}
                value={tempInputs.minPrice}
                onChange={handleMinPriceChange}
                className="price-slider price-slider-min"
                disabled={loading}
              />
              
              {/* Max Price Handle */}
              <input
                type="range"
                id="maxPrice"
                name="maxPrice"
                min={MIN_PRICE}
                max={MAX_PRICE}
                step={STEP}
                value={tempInputs.maxPrice}
                onChange={handleMaxPriceChange}
                className="price-slider price-slider-max"
                disabled={loading}
              />
              
              <div className="price-range-values">
                <span>${formatPrice(MIN_PRICE)}</span>
                <span>${formatPrice(MAX_PRICE)}</span>
              </div>
            </div>
          </div>

          {/* Manufacturer filter removed */}
        </div>
      </form>

      {error && (
        <div className="error">{error}</div>
      )}

      {!error && !loading && totalCount > 0 && (
        <div className="results-summary">
          Showing {products.length} of {totalCount.toLocaleString()} products
          {(filters.minPrice > MIN_PRICE || filters.maxPrice < MAX_PRICE || searchQuery) && (
            <span className="filter-indicator"></span>
          )}
          {totalPages > 1 && (
            <span className="page-indicator"> (Page {currentPage} of {totalPages})</span>
          )}
        </div>
      )}

      {/* Comparison Panel */}
      {compareItems.length > 0 && (
        <div className={`comparison-panel ${showComparison ? 'show' : ''}`}>
          <div className="comparison-header">
            <h3>Product Comparison ({compareItems.length})</h3>
            <div className="comparison-actions">
              <button 
                className="clear-compare-btn" 
                onClick={clearCompareItems}
                disabled={compareItems.length === 0}
              >
                Clear All
              </button>
              <button 
                className="compare-details-btn" 
                onClick={toggleCompareModal}
                disabled={compareItems.length < 2}
              >
                Compare Details
              </button>
              <button className="toggle-compare-btn" onClick={toggleComparison}>
                {showComparison ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          
          {showComparison && (
            <div className="comparison-items">
              {compareItems.map(item => (
                <div key={item.buildcores_id} className="comparison-item">
                  <button 
                    className="remove-compare-btn" 
                    onClick={() => handleRemoveFromCompare(item.buildcores_id)}
                    aria-label="Remove from comparison"
                  >
                    ×
                  </button>
                  <img 
                    src={item.image} 
                    alt={item.name}
                    className="comparison-image"
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/100x100?text=No+Image';
                    }}
                  />
                  <div className="comparison-item-details">
                    <h4>{item.name}</h4>
                    {item.v2_lowest_prices?.US && (
                      <span className="comparison-price">${item.v2_lowest_prices.US.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comparison Modal */}
      {showCompareModal && (
        <div className="comparison-modal-overlay" onClick={toggleCompareModal}>
          <div className="comparison-modal" onClick={(e) => e.stopPropagation()}>
            <div className="comparison-modal-header">
              <h2>Detailed Comparison</h2>
              <button className="close-modal-btn" onClick={toggleCompareModal}>×</button>
            </div>
            <div className="comparison-modal-content">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Specification</th>
                    {compareItems.map(item => (
                      <th key={item.buildcores_id}>
                        <div className="modal-product-header">
                          <img 
                            src={item.image} 
                            alt={item.name}
                            className="modal-product-image"
                            onError={(e) => {
                              e.target.src = 'https://via.placeholder.com/60x60?text=No+Image';
                            }}
                          />
                          <span>{item.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Price Row */}
                  <tr>
                    <td className="spec-name">Price</td>
                    {compareItems.map(item => (
                      <td key={item.buildcores_id} className="spec-value price-value">
                        {item.v2_lowest_prices?.US ? (
                          `$${item.v2_lowest_prices.US.toFixed(2)}`
                        ) : (
                          'N/A'
                        )}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Brand Row */}
                  <tr>
                    <td className="spec-name">Brand</td>
                    {compareItems.map(item => (
                      <td key={item.buildcores_id} className="spec-value">
                        {item.partBrand || 'N/A'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Form Factor Row (if available) */}
                  <tr>
                    <td className="spec-name">Form Factor</td>
                    {compareItems.map(item => (
                      <td key={item.buildcores_id} className="spec-value">
                        {item.formFactor || 'N/A'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Color Row (if available) */}
                  <tr>
                    <td className="spec-name">Color</td>
                    {compareItems.map(item => (
                      <td key={item.buildcores_id} className="spec-value">
                        {item.color || 'N/A'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Dimensions Row (if available) */}
                  <tr>
                    <td className="spec-name">Dimensions</td>
                    {compareItems.map(item => (
                      <td key={item.buildcores_id} className="spec-value">
                        {item.dimensions || 'N/A'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Weight Row (if available) */}
                  <tr>
                    <td className="spec-name">Weight</td>
                    {compareItems.map(item => (
                      <td key={item.buildcores_id} className="spec-value">
                        {item.weight ? `${item.weight} kg` : 'N/A'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="products-grid">
        {loading && renderSkeletonCards()}
        
        {!loading && products.length > 0 && 
          <>
            {products.map((product) => (
              <div key={product.buildcores_id || product.id} className="product-card">
                <img 
                  src={product.image} 
                  alt={product.name}
                  className="product-image"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/200x200?text=No+Image';
                  }}
                />
                <div className="product-details">
                  <h3>{product.name}</h3>
                  {product.partBrand && <p className="manufacturer">{product.partBrand}</p>}
                  <div className="price-container">
                    {product.v2_lowest_prices?.US && (
                      <p className="price">${product.v2_lowest_prices.US.toFixed(2)}</p>
                    )}
                  </div>
                  <button 
                    className={`compare-btn ${compareItems.some(item => item.buildcores_id === product.buildcores_id) ? 'in-compare' : ''}`}
                    onClick={() => handleToggleCompare(product)}
                  >
                    {compareItems.some(item => item.buildcores_id === product.buildcores_id) 
                      ? 'In Comparison' 
                      : 'Add to Compare'}
                  </button>
                </div>
              </div>
            ))}
            
            {/* Add empty placeholders to maintain grid structure */}
            {products.length < PRODUCTS_PER_PAGE && 
              Array(PRODUCTS_PER_PAGE - products.length).fill().map((_, i) => (
                <div key={`placeholder-${i}`} className="grid-placeholder"></div>
              ))
            }
          </>
        }
      </div>

      {!loading && renderPagination()}

      {!loading && products.length === 0 && !error && (
        <div className="no-results">
          No products found. Try adjusting your search or filters.
        </div>
      )}
    </div>
  );
};

export default ProductSearch;
