const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const cdcFeed = document.getElementById('cdcFeed');
const liveIndicator = document.querySelector('[data-testid="live-indicator"]');

let searchTimeout;
let eventSource;

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

async function performSearch(query) {
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (data.hits && data.hits.length > 0) {
      displayResults(data.hits);
    } else {
      searchResults.innerHTML = '<div class="loading">No products found</div>';
    }
  } catch (err) {
    console.error('Search error:', err);
    searchResults.innerHTML = '<div class="loading">Search error occurred</div>';
  }
}

function displayResults(hits) {
  searchResults.innerHTML = hits.map(product => `
    <div class="product-card">
      <div class="product-name">${escapeHtml(product.name)}</div>
      <div class="product-description">${escapeHtml(product.description)}</div>
      <div class="product-meta">
        <span class="product-price">${formatPrice(product.price)}</span>
        <span class="product-category">${escapeHtml(product.category || 'Uncategorized')}</span>
        <span class="product-stock ${product.in_stock ? 'in-stock' : 'out-of-stock'}">
          ${product.in_stock ? `In Stock (${product.quantity})` : 'Out of Stock'}
        </span>
      </div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function flashLiveIndicator() {
  liveIndicator.classList.add('flash');
  setTimeout(() => {
    liveIndicator.classList.remove('flash');
  }, 500);
}

function addCDCEvent(event) {
  const feedEmpty = cdcFeed.querySelector('.feed-empty');
  if (feedEmpty) {
    feedEmpty.remove();
  }

  const eventDiv = document.createElement('div');
  eventDiv.className = `cdc-event ${event.operation.toLowerCase()}`;

  let details = '';
  if (event.data) {
    if (event.operation === 'DELETE') {
      details = `Product ID: ${event.data.id}`;
    } else {
      details = `${escapeHtml(event.data.name || 'Unknown')} - ${formatPrice(event.data.price || 0)}`;
    }
  }

  eventDiv.innerHTML = `
    <div class="event-header">
      <span class="event-operation ${event.operation.toLowerCase()}">${event.operation}</span>
      <span class="event-time">${formatTime(event.timestamp)}</span>
    </div>
    <div class="event-details">
      <span class="event-table">${event.table}</span>: ${details}
    </div>
  `;

  cdcFeed.insertBefore(eventDiv, cdcFeed.firstChild);

  const events = cdcFeed.querySelectorAll('.cdc-event');
  if (events.length > 50) {
    events[events.length - 1].remove();
  }

  flashLiveIndicator();
}

function connectSSE() {
  eventSource = new EventSource('/api/cdc-stream');

  eventSource.addEventListener('cdc_event', (e) => {
    try {
      const event = JSON.parse(e.data);
      addCDCEvent(event);

      if (searchInput.value.trim()) {
        performSearch(searchInput.value.trim());
      }
    } catch (err) {
      console.error('Error parsing event:', err);
    }
  });

  eventSource.onerror = () => {
    console.error('SSE connection error, reconnecting...');
    eventSource.close();
    setTimeout(connectSSE, 3000);
  };
}

searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();

  if (query.length === 0) {
    searchResults.innerHTML = '<div class="loading">Start typing to search...</div>';
    return;
  }

  searchResults.innerHTML = '<div class="loading">Searching...</div>';

  searchTimeout = setTimeout(() => {
    performSearch(query);
  }, 300);
});

connectSSE();
performSearch('');
