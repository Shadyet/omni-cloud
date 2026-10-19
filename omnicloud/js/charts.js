/* ==========================================================================
   OmniCloud - Interactive SVG Analytics & Storage Breakdown Charts
   ========================================================================== */

class ChartEngine {
  static renderStorageDonutChart(containerId, providers) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const connectedProviders = providers.filter(p => p.status === 'connected');
    const totalGB = connectedProviders.reduce((acc, p) => acc + p.totalStorageGB, 0);
    const usedGB = connectedProviders.reduce((acc, p) => acc + p.usedStorageGB, 0);
    const usedPercentage = Math.round((usedGB / totalGB) * 100);

    // Calculate stroke SVG dash offsets
    const size = 180;
    const strokeWidth = 18;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    let strokeDashAccumulator = 0;
    let svgArcs = '';

    connectedProviders.forEach(p => {
      const providerPercentage = p.usedStorageGB / totalGB;
      const dashArray = providerPercentage * circumference;
      const strokeDashoffset = -strokeDashAccumulator;
      strokeDashAccumulator += dashArray;

      svgArcs += `
        <circle 
          cx="${size/2}" 
          cy="${size/2}" 
          r="${radius}" 
          fill="transparent" 
          stroke="${p.color}" 
          stroke-width="${strokeWidth}" 
          stroke-dasharray="${dashArray} ${circumference - dashArray}" 
          stroke-dashoffset="${strokeDashoffset}"
          style="transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);"
        >
          <title>${p.name}: ${p.usedStorageGB} GB used</title>
        </circle>
      `;
    });

    container.innerHTML = `
      <div style="position: relative; display: inline-flex; align-items: center; justify-content: center;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
          <circle 
            cx="${size/2}" 
            cy="${size/2}" 
            r="${radius}" 
            fill="transparent" 
            stroke="rgba(255,255,255,0.06)" 
            stroke-width="${strokeWidth}"
          />
          ${svgArcs}
        </svg>
        <div style="position: absolute; text-align: center; display: flex; flex-direction: column; align-items: center;">
          <span style="font-family: 'Outfit'; font-size: 1.6rem; font-weight: 800; line-height: 1;">${usedPercentage}%</span>
          <span style="font-size: 0.7rem; color: var(--text-dim); font-weight: 600; text-transform: uppercase; margin-top: 2px;">Used Space</span>
        </div>
      </div>
    `;
  }

  static renderFileTypeBreakdown(containerId, files) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const categories = {
      document: { name: 'Documents & PDFs', color: '#4facfe', icon: 'ph-file-pdf', bytes: 0 },
      video: { name: 'Videos & Media', color: '#ff4757', icon: 'ph-video', bytes: 0 },
      image: { name: 'Photos & Graphics', color: '#10b981', icon: 'ph-image', bytes: 0 },
      code: { name: 'Source Code & Scripts', color: '#8a2be2', icon: 'ph-code', bytes: 0 },
      audio: { name: 'Music & Audio', color: '#f59e0b', icon: 'ph-music-notes', bytes: 0 },
      archive: { name: 'Archives & Vaults', color: '#d9272e', icon: 'ph-lock-key', bytes: 0 }
    };

    let totalBytes = 0;
    files.forEach(f => {
      totalBytes += f.sizeBytes || 0;
      if (categories[f.type]) {
        categories[f.type].bytes += f.sizeBytes || 0;
      }
    });

    if (totalBytes === 0) totalBytes = 1; // prevent divide by zero

    let html = '<div class="category-bars">';
    Object.values(categories).forEach(cat => {
      const percentage = Math.round((cat.bytes / totalBytes) * 100);
      const formattedSize = ChartEngine.formatBytes(cat.bytes);

      html += `
        <div class="category-bar-item">
          <div class="category-info">
            <div class="category-name">
              <div class="category-icon" style="background: ${cat.color}20; color: ${cat.color}">
                <i class="ph ${cat.icon}"></i>
              </div>
              <span>${cat.name}</span>
            </div>
            <div style="font-weight: 600;">${formattedSize} <span style="font-size: 0.75rem; color: var(--text-dim);">(${percentage}%)</span></div>
          </div>
          <div class="progress-bar-container" style="height: 6px; background: rgba(255,255,255,0.06);">
            <div class="progress-bar-fill" style="width: ${percentage}%; background: ${cat.color};"></div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  static formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}
