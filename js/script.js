/* =========================================
   1. GLOBAL CONFIGURATION & VARIABLES
   ========================================= */
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=0&single=true&output=csv&t=" + Date.now();
const bioSheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=263826725&single=true&output=csv&t=" + Date.now();

// PATHS
const ASSET_PATH = './assets/';

// GLOBAL STATE
let activeDots = [];
let mouse = { x: -9999, y: -9999 }; // Fixes "mouse is not defined"
let allProjectData = [];
let cachedBioHTML = "";
let bioLoaded = false;
let projectsLoaded = false;
let currentAudioDot = null;
let currentActiveList = [];
let currentProjectAudio = null;

/* =========================================
   2. INITIALIZATION & DATA LOADING
   ========================================= */
const cursorElement = document.getElementById('custom-cursor');
if (cursorElement) cursorElement.classList.add('cursor-loading');

// A. FETCH PROJECT DATA
Papa.parse(sheetURL, {
    download: true,
    header: true,
    complete: function (results) {
        allProjectData = results.data;

        // Render UI
        renderTable(allProjectData);
        renderTags(allProjectData);

        // Render Scene (Fixes "renderScene is not defined")
        renderScene(allProjectData);

        // Initialize 3D
        init3D();

        // Start Physics Loop
        requestAnimationFrame(animateDots);

        // Check if there is a hash (e.g. #My%20Project)
        const rawHash = window.location.hash.replace('#', '');
        
        if (rawHash) {
            const target = decodeURIComponent(rawHash); // Turn %20 back into spaces
            
            if (target === 'archive') {
                openArchive();
            } else {
                // Try to open the project immediately
                // The openProject function safeguards against invalid names automatically
                openProject(target);
            }
        }

        // Reveal Site
        window.hideLoadingScreen();
    }
});

// B. PRE-FETCH BIO
Papa.parse(bioSheetURL, {
    download: true,
    header: true,
    complete: function (results) {
        if (results.data && results.data[0]) {
            cachedBioHTML = results.data[0]['content'] || results.data[0]['bio_text'];
        }
        bioLoaded = true;
        if (window.location.hash === '#about') {
            openAbout();
        }
        checkAllReady();
    }
});

function checkAllReady() {
    if (projectsLoaded && bioLoaded) {
        if (cursorElement) cursorElement.classList.remove('cursor-loading');
    }
}

// C. REVEAL FUNCTION
window.hideLoadingScreen = function () {
    const loader = document.getElementById('loading-screen');
    const canvas = document.getElementById('three-canvas');
    const mainScene = document.getElementById('main-scene');

    // STAGE 1: Reveal Ghost (Canvas AND Dots)
    if (canvas) {
        canvas.style.opacity = '1';
        canvas.style.visibility = 'visible';
    }
    if (mainScene) mainScene.style.opacity = '1';

    // STAGE 2: Fade Loader
    setTimeout(() => {
        if (loader) loader.style.opacity = '0';
    }, 100);

    // STAGE 3: Focus & Cleanup
    setTimeout(() => {
        if (canvas) canvas.style.filter = 'blur(0px)';
        if (mainScene) mainScene.style.filter = 'blur(0px)';

        setTimeout(() => {
            if (loader) loader.remove();
            if (window.cursorElement) {
                window.cursorElement.classList.remove('cursor-loading', 'cursor-loading-pulse');
                Object.assign(window.cursorElement.style, {
                    position: '',
                    top: '',
                    left: '',
                    transform: ''
                });
            }
        }, 1500);
    }, 1500);
};

/* =========================================
   3. SCENE LOGIC (The Dots)
   ========================================= */
function renderScene(data) {
    const container = document.getElementById('dots-container');
    if (!container) return;

    container.innerHTML = "";
    activeDots = [];

    data.forEach(project => {
        if (!project.project_name) return;

        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.style.setProperty('--delay', `-${Math.random() * 3}s`);

        // 1. Folder Logic (RESTORED DESKTOP CLICK)
        if (project.folder) {
            dot.dataset.folder = project.folder;
            
            // This handles the Desktop Mouse Click
            dot.onclick = function (e) {
                // Ignore touch events here (they are handled by the global touch listener)
                if (e.pointerType === 'touch' || e.detail === 0) return; 
                openProject(project.folder);
            };
        }

        // 2. 3D Model Logic
        const glbFile = project.model_glb;
        if (glbFile && glbFile.trim() !== "") {
            dot.dataset.glb = glbFile.trim();
            dot.classList.add('has-3d');
        }

        // 3. Audio Logic (Local Files)
        let audioObj = null;
        const audioFilename = project.audio;
        if (audioFilename && audioFilename.trim() !== "") {
            dot.classList.add('has-audio');

            const localAudioPath = ASSET_PATH + audioFilename.trim();
            audioObj = new Audio(localAudioPath);
            
            audioObj.loop = false; // Strict No Loop
            audioObj.volume = 0;
            audioObj.preload = 'auto';

            // Auto-Release when audio ends
            audioObj.onended = () => {
                const activeDotData = activeDots.find(d => d.audio === audioObj);
                if (activeDotData) {
                    activeDotData.audioFinished = true; 
                    
                    // If this was the active 3D model, hide it immediately
                    if (activeDot === activeDotData.element) {
                        isHovering = false;
                        activeDot.classList.remove('is-active-3d');
                        activeDot = null;
                    }
                }
            };

            audioObj.addEventListener('error', (e) => {
                console.warn("Audio file missing or blocked:", localAudioPath);
            });
        }

        // 4. Random Position
        let x = Math.random() * 80 + 10;
        let y = Math.random() * 80 + 10;
        let vx = (Math.random() - 0.5) * 0.06;
        let vy = (Math.random() - 0.5) * 0.06;

        dot.style.left = x + '%';
        dot.style.top = y + '%';
        dot.style.transform = `translate(-50%, -50%) scale(1)`;
        dot.style.opacity = project.folder ? 1 : 0.3;

        container.appendChild(dot);

        activeDots.push({
            element: dot,
            x: x,
            y: y,
            vx: vx,
            vy: vy,
            folder: project.folder,
            hasFolder: !!project.folder,
            audio: audioObj,
            hasAudio: !!audioObj,
            audioFinished: false
        });
    });
}

/* =========================================
   4. PHYSICS ENGINE & ANIMATION LOOP
   ========================================= */
const SENSITIVITY_RADIUS = 80;
const AUDIO_RADIUS = 150;
const MAX_SCALE = 1.1;

function animateDots() {
    // 1. Check overlays
    const archiveOverlay = document.getElementById('archive-overlay');
    const projectOverlay = document.getElementById('project-overlay');
    const aboutOverlay = document.getElementById('about-overlay');

    const archiveOpen = archiveOverlay ? archiveOverlay.style.display === 'flex' : false;
    const projectOpen = projectOverlay ? projectOverlay.style.display === 'flex' : false;
    const aboutOpen = aboutOverlay ? aboutOverlay.style.display === 'flex' : false;
    const isOverlayOpen = archiveOpen || projectOpen || aboutOpen;

    // 2. Hide mouse if overlay is open
    const localMouseX = isOverlayOpen ? -9999 : mouse.x;
    const localMouseY = isOverlayOpen ? -9999 : mouse.y;

    activeDots.forEach(dot => {
        
        // --- A. MOVEMENT LOGIC ---
        // Only move the dot if it is NOT the active 3D model.
        // If it IS the active model, we just lock the position but continue to Audio logic.
        
        if (dot.element.classList.contains('is-active-3d')) {
            dot.element.style.left = dot.x + '%';
            dot.element.style.top = dot.y + '%';
            // DO NOT RETURN HERE! WE NEED TO RUN THE AUDIO CHECK BELOW!
        } else {
            // Standard Physics Movement
            const dotPixelX = (window.innerWidth * dot.x) / 100;
            const dotPixelY = (window.innerHeight * dot.y) / 100;
            const dist = Math.hypot(localMouseX - dotPixelX, localMouseY - dotPixelY);

            let speedFactor = 1.0;
            if (dist < SENSITIVITY_RADIUS) {
                speedFactor = 1 - (1 - (dist / SENSITIVITY_RADIUS));
            }

            dot.x += dot.vx * speedFactor;
            dot.y += dot.vy * speedFactor;

            // Bounce
            if (dot.x <= 2 || dot.x >= 98) dot.vx *= -1;
            if (dot.y <= 2 || dot.y >= 98) dot.vy *= -1;
        }

        // Recalculate distance for Audio/Visuals (Need this even if frozen)
        const dotPixelX = (window.innerWidth * dot.x) / 100;
        const dotPixelY = (window.innerHeight * dot.y) / 100;
        const dist = Math.hypot(localMouseX - dotPixelX, localMouseY - dotPixelY);

        // --- B. AUDIO LOGIC ---
        if (dot.hasAudio && !isOverlayOpen) {
            
            // If user leaves the zone, reset the "Finished" flag so it can play again later
            if (dist > AUDIO_RADIUS) {
                dot.audioFinished = false;
                if(dot.audio.paused) dot.audio.currentTime = 0;
            }

            // Play if inside radius AND track hasn't ended naturally
            if (!dot.audioFinished) {
                if (dist < AUDIO_RADIUS) {
                    let vol = 1 - (dist / AUDIO_RADIUS);
                    vol = Math.max(0, Math.min(1, vol));

                    if (dot.audio) {
                        dot.audio.volume = vol;
                        if (dot.audio.paused && vol > 0.01) {
                            dot.audio.play().catch(e => {});
                        }
                    }
                } else {
                    // Fade out/Stop
                    if (dot.audio && !dot.audio.paused) {
                        dot.audio.pause();
                    }
                }
            } 
        }

        // --- C. VISUAL SCALING ---
        let scale = 1;
        let shadowStyle = 'none';

        if (dist < SENSITIVITY_RADIUS && !dot.audioFinished) {
            const proximity = 1 - (dist / SENSITIVITY_RADIUS);
            scale = 1 + (proximity * (MAX_SCALE - 1));

            if (dot.hasFolder) {
                const blur = 15 * proximity;
                const spread = 2 * proximity;
                const alpha = proximity * 1;
                shadowStyle = `0 0 ${blur}px ${spread}px rgba(0, 47, 167, ${alpha})`;
                dot.element.style.opacity = 1;
            } else {
                dot.element.style.opacity = 0.3;
            }
        } else {
            dot.element.style.opacity = dot.hasFolder ? 1 : 0.3;
        }

        // Update DOM
        dot.element.style.left = dot.x + '%';
        dot.element.style.top = dot.y + '%';
        dot.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
        dot.element.style.boxShadow = shadowStyle;
    });

    requestAnimationFrame(animateDots);
}


// Global Mouse Tracker
document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

/* =========================================
   5. UI HELPER FUNCTIONS (Tags, Table, Nav)
   ========================================= */

function sortTable(n) {
    const table = document.getElementById("artist-database");
    let rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
    switching = true;
    dir = "asc";

    // Remove 'active-sort' class from all headers
    const headers = table.getElementsByTagName("th");
    for (let h of headers) h.classList.remove("active-sort");
    // Add to current header
    headers[n].classList.add("active-sort");

    while (switching) {
        switching = false;
        rows = table.rows;
        for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            x = rows[i].getElementsByTagName("td")[n];
            y = rows[i + 1].getElementsByTagName("td")[n];

            let xVal = x.innerHTML.toLowerCase();
            let yVal = y.innerHTML.toLowerCase();

            // Check if numeric (for ID and Year)
            if (!isNaN(parseFloat(xVal)) && !isNaN(parseFloat(yVal))) {
                xVal = parseFloat(xVal);
                yVal = parseFloat(yVal);
            }

            if (dir == "asc") {
                if (xVal > yVal) { shouldSwitch = true; break; }
            } else if (dir == "desc") {
                if (xVal < yVal) { shouldSwitch = true; break; }
            }
        }
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
            switchcount++;
        } else {
            if (switchcount == 0 && dir == "asc") {
                dir = "desc";
                switching = true;
            }
        }
    }
    updateActiveListFromDOM();
}

function renderTags(data) {
    const tagBar = document.getElementById('tag-bar');
    if (!tagBar) return;

    tagBar.innerHTML = "";
    let allTags = new Set();

    data.forEach(project => {
        if (project.medium) {
            const tags = project.medium.split(',').map(t => t.trim());
            tags.forEach(tag => { if (tag) allTags.add(tag); });
        }
    });

    const allBtn = document.createElement('button');
    allBtn.textContent = "all";
    allBtn.className = "tag-btn active";
    allBtn.onclick = function (e) { filterByTag('all', e.target); };
    tagBar.appendChild(allBtn);

    Array.from(allTags).sort().forEach(tag => {
        const btn = document.createElement('button');
        btn.textContent = tag.toLowerCase();
        btn.className = "tag-btn";
        btn.onclick = function (e) { filterByTag(tag, e.target); };
        tagBar.appendChild(btn);
    });
}

function renderTable(data) {
    currentActiveList = data;
    const tableBody = document.getElementById('database-body');
    if (!tableBody) return;

    tableBody.innerHTML = "";
    data.forEach(project => {
        if (!project.project_name) return;

        const row = document.createElement('tr');
        row.className = 'project-row';

        if (project.folder) row.dataset.folder = project.folder;

        if (project.folder) {
            row.classList.add('has-folder');
            row.onclick = function () { openProject(project.folder); };
        }

        row.setAttribute('data-tags', project.medium ? project.medium : "");

        const columns = [project.project_id, project.project_name, project.year, project.place, project.institution, project.collaborators];
        columns.forEach(text => {
            const cell = document.createElement('td');
            cell.textContent = text || "";
            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });
}

function initScrollShadows() {
    const containers = document.querySelectorAll('.has-scroll-shadows');

    containers.forEach(container => {
        // 1. Create Shadows
        const topShadow = document.createElement('div');
        topShadow.className = 'scroll-shadow is-top';
        
        const bottomShadow = document.createElement('div');
        bottomShadow.className = 'scroll-shadow is-bottom';

        // 2. Insert (Top first, Bottom last)
        container.prepend(topShadow); 
        container.append(bottomShadow);

        // 3. The Check Logic
        const handleScroll = () => {
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight;
            const clientHeight = container.clientHeight;

            // Top Shadow
            if (scrollTop > 10) { 
                topShadow.classList.add('is-visible');
            } else {
                topShadow.classList.remove('is-visible');
            }

            // Bottom Shadow (Check if there is more content below)
            if (scrollHeight - scrollTop - clientHeight > 10) {
                bottomShadow.classList.add('is-visible');
            } else {
                bottomShadow.classList.remove('is-visible');
            }
        };

        // 4. Listeners
        container.addEventListener('scroll', handleScroll);
        window.addEventListener('resize', handleScroll);
        
        // --- NEW: Watch for content changes! ---
        // This fixes the issue where shadows wait for a scroll
        const observer = new MutationObserver(() => {
            handleScroll(); // Re-check whenever content changes
        });
        
        // Start watching the container for new elements/text
        observer.observe(container, { childList: true, subtree: true, characterData: true });
        
        // 5. Initial Check
        handleScroll();
    });
}

// Run on load
document.addEventListener('DOMContentLoaded', initScrollShadows);


function updateActiveListFromDOM() {
    const rows = document.querySelectorAll('.project-row');
    const newList = [];

    rows.forEach(row => {
        // 1. Check if the row is visible
        if (row.style.display !== 'none') {
            // 2. Get the folder name attached to the row
            const folder = row.dataset.folder;
            if (folder) {
                // 3. Find the full data object for this folder
                const projectData = allProjectData.find(p => p.folder === folder);
                if (projectData) {
                    newList.push(projectData);
                }
            }
        }
    });

    // 4. Update the global active list
    if (newList.length > 0) {
        currentActiveList = newList;
    }
}

function filterByTag(selectedTag, buttonElement) {
    const rows = document.querySelectorAll('.project-row');
    const buttons = document.querySelectorAll('.tag-btn');

    buttons.forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');

    rows.forEach(row => {
        const rowData = row.getAttribute('data-tags');
        if (selectedTag === 'all' || (rowData && rowData.includes(selectedTag))) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
    updateActiveListFromDOM();
}

// Navigation Memory
let wasArchiveOpenBefore = false;


function closeAllOverlays() {
    // 1. URL Handling
    if (window.location.hash === '#about') {
        const overlay = document.getElementById('about-overlay');
        const returnPath = overlay ? overlay.getAttribute('data-return') : '';

        if (returnPath && returnPath !== '') {
            window.location.hash = returnPath; // Go back to Project or Archive
        } else {
            // Remove hash cleanly
            history.pushState("", document.title, window.location.pathname + window.location.search);
        }
    }

    // 2. Hide Overlays
    ['archive-overlay', 'project-overlay', 'about-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // 3. Cleanup Audio
    if (typeof currentProjectAudio !== 'undefined' && currentProjectAudio) {
        currentProjectAudio.pause();
        currentProjectAudio = null;
    }

    // 4. Reset Cursor
    if (typeof cursorElement !== 'undefined') {
        cursorElement.classList.remove('cursor-loading', 'hover-active');
    }

    // 5. Cleanup Shadows
    if (typeof activeShadows !== 'undefined') {
        activeShadows.forEach(s => s.remove());
        activeShadows = [];
    }
    
    // 6. Reset 3D (if exists)
    if (typeof resetScene === 'function') resetScene();
}

function openArchive() {
    closeAllOverlays();
    document.getElementById('archive-overlay').style.display = 'flex';
    window.location.hash = 'archive';
    activeShadows.forEach(s => s.remove());
    activeShadows = [];
}

function handleArchiveFade() {
    const wrapper = document.querySelector('.database-wrapper');
    if (!wrapper) return;

    const updateFade = () => {
        const scrollPos = wrapper.scrollTop + wrapper.clientHeight;
        const totalHeight = wrapper.scrollHeight;

        // If we are more than 10px away from the bottom, show the fade
        if (totalHeight - scrollPos > 10) {
            wrapper.classList.add('is-faded');
        } else {
            wrapper.classList.remove('is-faded');
        }
    };

    // Listen for scroll
    wrapper.addEventListener('scroll', updateFade);

    // Run once immediately to check if the list is short (no scroll needed)
    updateFade();
}

function closeArchive() {
    document.getElementById('archive-overlay').style.display = 'none';
    history.pushState("", document.title, window.location.pathname);
}

function openAbout() {
    const archiveEl = document.getElementById('archive-overlay');
    const projectEl = document.getElementById('project-overlay');
    const overlay = document.getElementById('about-overlay');
    // TARGET THE NEW SLOT, NOT THE PARENT
    const textSlot = document.getElementById('bio-text-slot'); 
    if (bioLoaded && cachedBioHTML) {
    textSlot.innerHTML = cachedBioHTML.replace(/\n/g, '<br>');
}

    closeAllOverlays();
    
    if (window.location.hash !== '#about') {
        history.pushState(null, null, '#about');
    }

    // [Logic for return paths remains the same...]
    const wasProjectOpen = (projectEl && projectEl.style.display === 'flex');
    const wasArchiveOpen = (archiveEl && archiveEl.style.display === 'flex');
    const currentHash = window.location.hash;

    if (wasProjectOpen) {
        overlay.setAttribute('data-return', currentHash);
    } else if (wasArchiveOpen) {
        overlay.setAttribute('data-return', '#archive');
    } else {
        overlay.removeAttribute('data-return');
    }

    // --- UPDATED INJECTION LOGIC ---
    if (bioLoaded && cachedBioHTML) {
        // Inject only into the text slot, leaving the <img> untouched
        textSlot.innerHTML = cachedBioHTML.replace(/\n/g, '<br>');
    } else {
        textSlot.textContent = "Loading...";
    }

    overlay.style.display = 'flex';
    setTimeout(updateScrollShadows, 100);
}

function closeAbout() {
    const overlay = document.getElementById('about-overlay');
    const returnPath = overlay.getAttribute('data-return');
    overlay.style.display = 'none';

    if (returnPath === '#archive') openArchive();
    else if (returnPath && returnPath.startsWith('#')) openProject(returnPath.substring(1));
    else history.pushState("", document.title, window.location.pathname);
}

/* =========================================
   6. PROJECT OVERLAY & CONTENT (UPDATED)
   ========================================= */

// Helper: Fix Google Drive Links
function convertToDirectLink(url) {
    if (url && url.includes("drive.google.com")) {
        let id = "";
        if (url.includes("/d/")) id = url.split('/d/')[1].split('/')[0];
        else if (url.includes("id=")) id = url.split('id=')[1].split('&')[0];
        if (id) return `https://lh3.googleusercontent.com/u/0/d/${id}=s2000`;
    }
    return url;
}

// Helper: Carousel Builder with 15/70/15 zones + Hover Shadows + Blur & Preload
function initCarousel(container, images, linkUrl) {
    container.innerHTML = ''; 

    // 1. The Image (Visual)
    const imgElement = document.createElement('img');
    imgElement.src = images[0];
    imgElement.className = "visual-content carousel-img";
    if (linkUrl) imgElement.classList.add('website-link-img');
    container.appendChild(imgElement);

    // 2. Logic: Indexing & Preloading (UPDATED ENGINE)
    let currentIndex = 0;
    
    // A. Silent Preloader
    const preload = (idx) => {
        if (images[idx]) {
            const loader = new Image();
            loader.src = images[idx];
        }
    };
    // Preload neighbors immediately
    preload(1);
    preload(images.length - 1);

    // B. New Update Function (Blur + Preload Wait)
    function updateImage() {
        // Start Blur
        imgElement.classList.add('is-loading');

        // Prepare next image in background
        const nextSrc = images[currentIndex];
        const tempLoader = new Image();
        tempLoader.src = nextSrc;
        
        tempLoader.onload = () => {
            // Swap only when ready
            imgElement.src = nextSrc;
            
            // Remove Blur (small timeout ensures transition plays)
            setTimeout(() => {
                imgElement.classList.remove('is-loading');
            }, 50);

            // Preload next neighbors for future clicks
            preload((currentIndex + 1) % images.length);
            preload((currentIndex - 1 + images.length) % images.length);
        };
    }

    function goNext(e) { if(e) e.stopPropagation(); currentIndex = (currentIndex + 1) % images.length; updateImage(); }
    function goPrev(e) { if(e) e.stopPropagation(); currentIndex = (currentIndex - 1 + images.length) % images.length; updateImage(); }

    // 3. Create Shadows (Hidden by default)
    const shadowLeft = document.createElement('div');
    shadowLeft.className = "carousel-shadow-overlay shadow-left";
    const shadowRight = document.createElement('div');
    shadowRight.className = "carousel-shadow-overlay shadow-right";
    container.appendChild(shadowLeft);
    container.appendChild(shadowRight);

    // LEFT ZONE (Width = 30%)
    const leftZone = document.createElement('div');
    leftZone.className = "carousel-click-zone";
    leftZone.style.cssText = "position:absolute; top:0; left:0; height:100%; width:30%; z-index:20; cursor:none;";
    leftZone.onclick = goPrev;

    // RIGHT ZONE (Width = 30%)
    const rightZone = document.createElement('div');
    rightZone.className = "carousel-click-zone";
    rightZone.style.cssText = "position:absolute; top:0; right:0; height:100%; width:30%; z-index:20; cursor:none;";
    rightZone.onclick = goNext;

    // CENTER ZONE (Starts at 30%, Width is 40%)
    const centerZone = document.createElement('a');
    // Important: 'left:30%' pushes it past the left zone, and 'width:40%' fills the gap
    centerZone.style.cssText = "position:absolute; top:0; left:30%; height:100%; width:40%; z-index:20; cursor:none; display:block;";
    
    if (linkUrl) {
        centerZone.href = linkUrl;
        centerZone.target = "_blank";
        centerZone.style.cursor = "pointer";
    } else {
        centerZone.removeAttribute('href');
        centerZone.style.pointerEvents = "none"; 
    }

    container.appendChild(leftZone);
    container.appendChild(rightZone);
    container.appendChild(centerZone);

    // 5. Events (Cursors + Shadows)
    const cursor = document.getElementById('custom-cursor');
    if (cursor) {
        // RIGHT HOVER
        rightZone.addEventListener('mouseenter', () => {
            cursor.classList.add('cursor-arrow-next');
            shadowRight.style.opacity = '1';
        });
        rightZone.addEventListener('mouseleave', () => {
            cursor.classList.remove('cursor-arrow-next');
            shadowRight.style.opacity = '0';
        });

        // LEFT HOVER
        leftZone.addEventListener('mouseenter', () => {
            cursor.classList.add('cursor-arrow-prev');
            shadowLeft.style.opacity = '1';
        });
        leftZone.addEventListener('mouseleave', () => {
            cursor.classList.remove('cursor-arrow-prev');
            shadowLeft.style.opacity = '0';
        });
        
        // CENTER HOVER
        if (linkUrl) {
            centerZone.addEventListener('mouseenter', () => {
                cursor.classList.add('hover-active');
                imgElement.classList.add('hover-active');
            });
            centerZone.addEventListener('mouseleave', () => {
                cursor.classList.remove('hover-active');
                imgElement.classList.remove('hover-active');
            });
        }
    }
}


// MAIN FUNCTION: OPEN PROJECT
function openProject(folderName) {
    if (!folderName) return;
    if (activeDot) {
        activeDot.classList.remove('is-active-3d');
        activeDot = null;
        isHovering = false;
        // Note: We do NOT stop the audio here. We let it play out.
    }
    const project = allProjectData.find(p => p.folder === folderName);

    if (project) {
        // 1. Manage Overlays
        const archiveOverlay = document.getElementById('archive-overlay');
        const isArchiveOpen = (archiveOverlay && archiveOverlay.style.display === 'flex');
        closeAllOverlays(); // Close others

        const projectOverlay = document.getElementById('project-overlay');
        if (projectOverlay) {
            // FORCE SCROLL TO TOP
            projectOverlay.scrollTop = 0; 
            
            // Also reset the internal wrapper if you have one
            const wrapper = projectOverlay.querySelector('.project-content-wrapper'); // or whatever your inner div is
            if (wrapper) wrapper.scrollTop = 0;
        }
        if (isArchiveOpen) projectOverlay.setAttribute('data-from-archive', 'true');
        else projectOverlay.removeAttribute('data-from-archive');

        window.location.hash = folderName;

        // 2. Populate Text Columns

        // A. Title
        const titleEl = document.getElementById('popup-title');
        if (titleEl) titleEl.textContent = project.project_name;

        // B. Description
        const descEl = document.getElementById('popup-description');
        if (descEl) descEl.innerHTML = (project.description || "").replace(/\n/g, '<br>');

        // C. Meta Data List (The New "Form" Layout)
        const metaContainer = document.getElementById('meta-container');
        if (metaContainer) {
            metaContainer.innerHTML = '';

            // UPDATED HELPER: Accepts 'isStacked' (true/false)
            const addMetaRow = (label, value, isStacked = false) => {
                if (!value || value.trim() === "") return;

                const row = document.createElement('div');

                row.className = 'meta-row';
                const formattedValue = String(value).replace(/\n/g, '<br>');

                row.innerHTML = `
                    <span class="meta-label">${label}</span>
                    <span class="meta-value">${value}</span>
                `;
                metaContainer.appendChild(row);
            };

            // --- DEFINE YOUR COLUMNS HERE ---

            // Standard Rows (Side-by-side)
            const linkData = project.link || project.website_link;
            
            if (linkData && linkData.trim() !== "") {
                const url = linkData.trim();
                const linkHTML = `<a href="${url}" target="_blank" class="link-interlaced" title="Visit Website"></a>`;
                addMetaRow("Link", linkHTML, true);
            }
            addMetaRow("Year", project.year, true);
            addMetaRow("Medium", project.medium, true);
            addMetaRow("Place", project.place);
            addMetaRow("Institution", project.institution, true);
            addMetaRow("Credits", project.credits, true);
            
        }

        // 3. Populate Visual Column
        const visualContainer = document.getElementById('popup-visual-container');
        if (visualContainer) {
            visualContainer.innerHTML = ''; 
            visualContainer.className = "col-visual"; 

            // Kill any previous audio just in case
            if (currentProjectAudio) {
                currentProjectAudio.pause();
                currentProjectAudio = null;
            }

            // --- A. AUDIO SETUP ---

            const projectLink = (project.link || project.website_link || "").trim();
            
            // --- FIX: USE THE SAME LOGIC AS THE DOTS ---
            const audioFilename = (project.audio || "").trim();
            // If filename exists, combine it with the global ASSET_PATH ('./assets/')
            const audioUrl = audioFilename ? ASSET_PATH + audioFilename : "";

            if (audioUrl) {
                currentProjectAudio = new Audio(audioUrl);
                currentProjectAudio.loop = true;
                currentProjectAudio.volume = 0; // Start silent
                // Add error listener to prevent crashes if file is missing
                currentProjectAudio.addEventListener('error', (e) => {
                    console.warn("Audio file not found (Popup):", audioUrl);
                });
            }

            // --- B. IMAGES & CAROUSEL ---
            let allSlides = [];
            if (project.title_image && project.title_image.trim() !== "") {
                allSlides.push(convertToDirectLink(project.title_image.trim()));
            }
            if (project.carousel && project.carousel.trim() !== "") {
                const carouselUrls = project.carousel.split(',').map(u => convertToDirectLink(u.trim()));
                allSlides = allSlides.concat(carouselUrls);
            }

            // --- C. RENDER ---
            if (allSlides.length > 0) {
                const carouselWrapper = document.createElement('div');
                carouselWrapper.className = 'carousel-container'; 
                carouselWrapper.style.cssText = "position:relative; flex-shrink:0; min-height:300px;"; 
                
                visualContainer.appendChild(carouselWrapper);

                // --- AUDIO FADE LOGIC (Crash-Proof) ---
                if (currentProjectAudio) {
                    let fadeInterval;
                    const audio = currentProjectAudio; // Local reference

                    const fadeIn = () => {
                        clearInterval(fadeInterval);
                        // Promise handling: ensures audio is ready to play
                        const playPromise = audio.play();
                        if (playPromise !== undefined) {
                            playPromise.catch(error => {
                                console.log("Audio autoplay prevented:", error);
                            });
                        }
                        
                        fadeInterval = setInterval(() => {
                            // Math.min ensures we never go above 1.0
                            if (audio.volume < 1.0) {
                                audio.volume = Math.min(1.0, audio.volume + 0.05);
                            } else {
                                clearInterval(fadeInterval);
                            }
                        }, 50);
                    };

                    const fadeOut = () => {
                        clearInterval(fadeInterval);
                        fadeInterval = setInterval(() => {
                            // Math.max ensures we never go below 0.0
                            if (audio.volume > 0.0) {
                                audio.volume = Math.max(0.0, audio.volume - 0.05);
                            } else {
                                clearInterval(fadeInterval);
                                audio.pause();
                                audio.currentTime = 0; // Reset track
                            }
                        }, 50);
                    };

                    // Attach Events
                    carouselWrapper.addEventListener('mouseenter', fadeIn);
                    carouselWrapper.addEventListener('mouseleave', fadeOut);
                    carouselWrapper.addEventListener('touchstart', fadeIn);
                    carouselWrapper.addEventListener('touchend', fadeOut);
                }

                // --- RENDER VISUALS ---
                if (allSlides.length === 1) {
                    const img = document.createElement('img');
                    img.src = allSlides[0];
                    img.className = "visual-content";
                    if (projectLink) {
                        img.classList.add('website-link-img');
                        img.onclick = () => window.open(projectLink, '_blank');
                    }
                    carouselWrapper.appendChild(img);
                } else {
                    initCarousel(carouselWrapper, allSlides, projectLink);
                }
            }
        }
        projectOverlay.style.display = "flex";

        // Wait 50ms for everything to settle
        setTimeout(() => {
            // 1. Shadows
            if (typeof updateScrollShadows === 'function') updateScrollShadows();

            
        }, 50);
    }
}


// Close Logic
function closeProject() {
    const projectOverlay = document.getElementById('project-overlay');
    const wasInArchive = projectOverlay.getAttribute('data-from-archive') === 'true';

    projectOverlay.style.display = "none";

    // Clean URL
    history.pushState("", document.title, window.location.pathname + window.location.search);

    // If we came from Archive, re-open it. Otherwise go to Home.
    if (wasInArchive) openArchive();
}



/* =========================================
   7. EVENTS & CURSOR (OPTIMIZED)
   ========================================= */

// Mouse State Variables
let currentMouseX = 0;
let currentMouseY = 0;
let isCursorTicking = false;

// 1. Lightweight Event Listener (Just captures data)
document.addEventListener('mousemove', (e) => {
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    
    // Update global physics mouse immediately (it's cheap)
    mouse.x = e.clientX;
    mouse.y = e.clientY;

    if (!isCursorTicking) {
        window.requestAnimationFrame(updateCursorVisuals);
        isCursorTicking = true;
    }
});

// 2. Heavy Visual Updates (Throttled to Frame Rate)
function updateCursorVisuals() {
    if (cursorElement) {
        cursorElement.style.left = currentMouseX + 'px';
        cursorElement.style.top = currentMouseY + 'px';
        
        // Check hover state only once per frame
        const el = document.elementFromPoint(currentMouseX, currentMouseY);
        const isClickable = el && el.closest('button, a, .dot, .project-row.has-folder, th, .tag-btn, .title, #fixed-archive-dot, .carousel-nav');
        
        if (isClickable) cursorElement.classList.add('hover-active');
        else cursorElement.classList.remove('hover-active');
    }
    
    // Also handle the 3D rotation logic here if dragging
    if ((isHovering || isDragging) && currentModel) {
        const deltaX = currentMouseX - previousMouse.x;
        const deltaY = currentMouseY - previousMouse.y;
        
        // Only apply rotation if dragging/hovering
        if (isDragging) {
             rotVelocity.x += deltaX * 0.95;
             rotVelocity.y += deltaY * 0.95;
        }
        
        previousMouse = { x: currentMouseX, y: currentMouseY };
    }

    isCursorTicking = false;
}

// Keep the Click/Keydown listeners as they were...
window.onclick = function(event) {
    if (event.target.id === 'project-overlay') closeProject();
    if (event.target.id === 'archive-overlay') closeArchive();
    if (event.target.id === 'about-overlay') closeAbout();
}

document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        if (document.getElementById('about-overlay').style.display === 'flex') closeAbout();
        else if (document.getElementById('project-overlay').style.display === 'flex') closeProject();
        else if (document.getElementById('archive-overlay').style.display === 'flex') closeArchive();
    }
});

/* =========================================
   8. DYNAMIC 3D HOVER (Fisheye Reflection)
   ========================================= */
const MODEL_SCALE = 0.7;
const CLOSE_DELAY = 500;

let scene, camera, renderer, loader, raycaster;
let globalEnvMap = null;
let currentWrapper = null;
let currentModel = null;
let modelCache = {};
let closeTimer = null;

let targetScale = 0;
let currentScale = 0;
let activeDot = null;
let isDragging = false;
let isHovering = false;
let previousMouse = { x: 0, y: 0 };
let rotVelocity = { x: 0, y: 0 };

const mathPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersectPoint = new THREE.Vector3();

function init3D() {
    if (typeof THREE === 'undefined') return;

    let canvas = document.getElementById('three-canvas');
    if (!canvas) return; // Should exist in HTML

    // Styling managed by CSS and hideLoadingScreen, but ensuring basics here
    canvas.style.opacity = '0';
    canvas.style.filter = 'blur(10px)';

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    new THREE.RGBELoader()
        .setPath(ASSET_PATH)
        .load('world.hdr', function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            globalEnvMap = texture;
            scene.environment = texture;
        });

    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 10;
    camera = new THREE.OrthographicCamera(
        viewSize * aspect / -2, viewSize * aspect / 2,
        viewSize / 2, viewSize / -2,
        0.1, 1000
    );
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(hemiLight);

    loader = new THREE.GLTFLoader();
    raycaster = new THREE.Raycaster();

    animate3D();
    window.addEventListener('resize', () => {
    onWindowResize(); // Your existing 3D resize
    updateScrollShadows(); // <--- ADD THIS
}, false);
}

function applyFisheyeEffect(geometry) {
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const positionAttribute = geometry.attributes.position;
    const normalAttribute = geometry.attributes.normal;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const sphereNormal = new THREE.Vector3();

    const tiltY = -0.25;
    const curvature = 0.1;

    for (let i = 0; i < positionAttribute.count; i++) {
        p.fromBufferAttribute(positionAttribute, i);
        n.fromBufferAttribute(normalAttribute, i);
        sphereNormal.subVectors(p, center).normalize();
        n.lerp(sphereNormal, curvature).normalize();
        n.y += tiltY;
        n.normalize();
        normalAttribute.setXYZ(i, n.x, n.y, n.z);
    }
    geometry.attributes.normal.needsUpdate = true;
}

function animate3D() {
    requestAnimationFrame(animate3D);

    const archiveOpen = document.getElementById('archive-overlay')?.style.display === 'flex';
    const projectOpen = document.getElementById('project-overlay')?.style.display === 'flex';
    const aboutOpen = document.getElementById('about-overlay')?.style.display === 'flex';

    if (archiveOpen || projectOpen || aboutOpen) {
        targetScale = 0;
        currentScale = 0;
        if (currentWrapper) currentWrapper.scale.set(0, 0, 0);
        isHovering = false;
        isDragging = false;
        if (closeTimer) clearTimeout(closeTimer);
    }
    else if (isDragging || isHovering) {
        targetScale = MODEL_SCALE;
    } else {
        targetScale = 0;
    }

    currentScale += (targetScale - currentScale) * 0.03;

    if (currentWrapper && currentModel) {
        rotVelocity.x *= 0.85;
        rotVelocity.y *= 0.85;
        currentModel.rotation.y += rotVelocity.x;
        currentModel.rotation.x += rotVelocity.y;

        currentWrapper.scale.set(currentScale, currentScale, currentScale);

        if (activeDot && currentScale > 0.001) {
            updatePositionWithRaycaster(activeDot);
        }

        if (currentScale > 0.001) {
            renderer.render(scene, camera);
        } else {
            renderer.clear();
            if (currentScale < 0.01 && targetScale === 0) {
                scene.remove(currentWrapper);
                if (activeDot) {
                    activeDot.classList.remove('is-active-3d');
                    activeDot = null;
                }
                currentWrapper = null;
                currentModel = null;
            }
        }
    }
}

function updatePositionWithRaycaster(element) {
    if (!camera || !element || !raycaster) return;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouse = new THREE.Vector2();
    mouse.x = (centerX / window.innerWidth) * 2 - 1;
    mouse.y = -(centerY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(mathPlane, planeIntersectPoint);

    if (currentWrapper) currentWrapper.position.copy(planeIntersectPoint);
}

function loadModel(filename) {
    // 1. INSTANT CLEANUP: Remove the old model immediately
    if (currentWrapper) {
        scene.remove(currentWrapper);
        currentWrapper = null;
        currentModel = null;
    }

    // 2. CHECK CACHE
    if (modelCache[filename]) {
        spawn(modelCache[filename].clone());
        return;
    }

    // 3. LOAD NEW
    loader.load(ASSET_PATH + filename, (gltf) => {
        // --- SAFETY CHECK: Are we still hovering the right dot? ---
        // If the user moved to another dot or left entirely, activeDot will be different.
        if (!activeDot || activeDot.dataset.glb !== filename) {
            return; // Stop. Do not spawn this model.
        }

        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const center = box.getCenter(new THREE.Vector3());
        m.position.sub(center);
        
        m.traverse(c => {
            if (c.isMesh) {
                c.geometry = c.geometry.clone();
                applyFisheyeEffect(c.geometry);
            }
        });

        modelCache[filename] = m;
        const group = new THREE.Group();
        group.add(m.clone());
        
        spawn(group);
    });
}

function spawn(model) {
    if (currentWrapper) scene.remove(currentWrapper);
    currentWrapper = new THREE.Group();
    scene.add(currentWrapper);
    currentModel = model;
    currentModel.rotation.set(0, Math.PI / 2, 0);
    currentWrapper.add(currentModel);
    currentWrapper.lookAt(camera.position);
    currentScale = 0;
    currentWrapper.scale.set(0, 0, 0);
    rotVelocity = { x: 0, y: 0 };
    updatePositionWithRaycaster(activeDot);
    targetScale = MODEL_SCALE;
}

// 3D Input Listeners
window.addEventListener('mousedown', (e) => {
    if (currentScale > 0.1) {
        isDragging = true;
        previousMouse = { x: e.clientX, y: e.clientY };
        rotVelocity = { x: 0, y: 0 };
    }
});
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', (e) => {
    if ((isHovering || isDragging) && currentModel) {
        // 1. Check if we are on mobile (screen width < 768px)
        const isMobile = window.innerWidth < 768;
        
        // 2. Set sensitivity: 0.003 is your current desktop speed.
        //    We divide it by 4 for mobile so it's not crazy fast.
        const sensitivity = isMobile ? 0.0008 : 0.003; 

        const deltaX = e.clientX - previousMouse.x;
        const deltaY = e.clientY - previousMouse.y;

        // 3. Use the new sensitivity variable
        rotVelocity.x += deltaX * sensitivity;
        rotVelocity.y += deltaY * sensitivity;
    }
    previousMouse = { x: e.clientX, y: e.clientY };
});
document.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('dot')) {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        previousMouse = { x: e.clientX, y: e.clientY };
        if (isDragging) return;
        if (activeDot === e.target) { isHovering = true; return; }

        const file = e.target.dataset.glb;
        if (file) {
            isHovering = true;
            if (activeDot) activeDot.classList.remove('is-active-3d');
            activeDot = e.target;
            activeDot.classList.add('is-active-3d');
            loadModel(file);
        }
    }
});
document.addEventListener('mouseout', (e) => {
    if (e.target.classList.contains('dot')) {
        closeTimer = setTimeout(() => { isHovering = false; }, CLOSE_DELAY);
    }
});

document.addEventListener('mousedown', (e) => {
    // 1. Safety check: Ensure triggerPulse exists
    if (typeof triggerPulse === 'function') {
        // 2. Only fire for mouse (touch handles itself)
        // Note: e.detail > 1 detects double clicks if needed, 
        // but simple mousedown is snappiest.
        triggerPulse(e.clientX, e.clientY);
    }
});

function onWindowResize() {
    if (!camera || !renderer) return;
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 10;
    camera.left = -viewSize * aspect / 2;
    camera.right = viewSize * aspect / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/* =========================================
   9. TOUCH LOGIC (Mobile Tap vs Drag)
   ========================================= */
let isTouchDrag = false;
let touchStartX = 0;
let touchStartY = 0;
let isScrolling = false;

// Helper to find dot under finger
function getClosestDot(x, y) {
    let closest = null;
    let minDist = Infinity;
    const TOUCH_THRESHOLD = 80; 

    activeDots.forEach(dot => {
        const rect = dot.element.getBoundingClientRect();
        const dist = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
        if (dist < minDist) { minDist = dist; closest = dot; }
    });
    return minDist < TOUCH_THRESHOLD ? closest : null;
}

// Visual feedback pulse
function triggerPulse(x, y) {
    const pulse = document.createElement('div');
    pulse.className = 'touch-pulse';
    pulse.style.left = x + 'px';
    pulse.style.top = y + 'px';
    document.body.appendChild(pulse);
    pulse.addEventListener('animationend', () => pulse.remove());
}

// 1. TOUCH START
window.addEventListener('touchstart', (e) => {
    // --- BLOCKER: If Overlay is Open, STOP EVERYTHING ---
    const isOverlayOpen = document.getElementById('project-overlay').style.display === 'flex' ||
                          document.getElementById('archive-overlay').style.display === 'flex' ||
                          document.getElementById('about-overlay').style.display === 'flex';
    
    if (isOverlayOpen) return; 
    // ----------------------------------------------------

    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    isTouchDrag = false;
    isScrolling = false;
    
    // Check if we hit a 3D model to prep rotation
    const targetDotData = getClosestDot(t.clientX, t.clientY);
    if (targetDotData && activeDot === targetDotData.element && isHovering) {
         isDragging = true; // Prep for rotation
         previousMouse = { x: t.clientX, y: t.clientY };
         rotVelocity = { x: 0, y: 0 };
    }
}, { passive: false });

// 2. TOUCH MOVE (Fixed Math & Sensitivity)
window.addEventListener('touchmove', (e) => {
    // Check blocker
    const isOverlayOpen = document.getElementById('project-overlay').style.display === 'flex' ||
                          document.getElementById('archive-overlay').style.display === 'flex' ||
                          document.getElementById('about-overlay').style.display === 'flex';
    
    if (isOverlayOpen) return;

    const t = e.touches[0];
    
    // Calculate TOTAL distance from start (Used ONLY to detect Scroll vs Drag intent)
    const totalDx = t.clientX - touchStartX;
    const totalDy = t.clientY - touchStartY;
    
    // If we moved significantly, mark it as interaction
    if (Math.hypot(totalDx, totalDy) > 10) {
        isTouchDrag = true;
    }

    // --- DIRECTION CHECK ---
    // If Vertical movement is greater than Horizontal -> IT IS SCROLLING
    if (Math.abs(totalDy) > Math.abs(totalDx)) {
        isScrolling = true;
        isDragging = false; // Cancel 3D rotation
        return; // Allow native browser scroll
    }

    // --- ROTATION LOGIC ---
    // If Horizontal is dominant AND we successfully started a drag on a model
    if (isDragging && currentModel && isHovering && !isScrolling) {
        e.preventDefault(); // Block browser swipe navigation (Back/Forward gestures)
        
        // CORRECTION: Calculate movement since the LAST FRAME, not from the start
        const deltaX = t.clientX - previousMouse.x;
        const deltaY = t.clientY - previousMouse.y;

        // SENSITIVITY: 0.003 is too fast for mobile. 
        // 0.0008 is usually the sweet spot for touch screens.
        const touchSensitivity = 0.002; 

        rotVelocity.x += deltaX * touchSensitivity;
        rotVelocity.y += deltaY * touchSensitivity;

        // CRITICAL: Update previous position for the next frame
        previousMouse = { x: t.clientX, y: t.clientY };
    }
}, { passive: false });

// 3. TOUCH END
window.addEventListener('touchend', (e) => {
    isDragging = false; 

    // --- BLOCKER: Stop clicks if overlay is open or if we scrolled ---
    const isOverlayOpen = document.getElementById('project-overlay').style.display === 'flex' ||
                          document.getElementById('archive-overlay').style.display === 'flex' ||
                          document.getElementById('about-overlay').style.display === 'flex';

    if (isOverlayOpen || isTouchDrag || isScrolling) return; 
    // ----------------------------------------------------------------

    const t = e.changedTouches[0];
    const targetData = getClosestDot(t.clientX, t.clientY);
    
    // [EMPTY SPACE TAP] -> RESET
    if (!targetData) {
        if (activeDot) {
            activeDot.classList.remove('is-active-3d');
            activeDot = null;
            isHovering = false;
        }
        activeDots.forEach(d => {
            if(d.audio) {
                d.audio.pause(); 
                d.audio.currentTime = 0;
            }
        });
        triggerPulse(t.clientX, t.clientY);
        return;
    }

    // [DOT TAP]
    const targetEl = targetData.element;
    e.preventDefault(); // Stop mouse emulation

    const isAlreadyPreviewing = (activeDot === targetEl);

    if (isAlreadyPreviewing) {
        // [2nd TAP] -> OPEN PROJECT
        if (targetData.folder) {
            openProject(targetData.folder);
        }
    } else {
        // [1st TAP] -> ACTIVATE PREVIEW
        if (activeDot) {
            activeDot.classList.remove('is-active-3d');
            activeDot = null;
        }
        
        // Silence others
        activeDots.forEach(d => {
            if(d.audio && d !== targetData) {
                d.audio.pause();
                d.audio.currentTime = 0;
            }
        });

        // Activate New
        activeDot = targetEl;
        isHovering = true; 

        if (targetEl.dataset.glb) {
            targetEl.classList.add('is-active-3d');
            loadModel(targetEl.dataset.glb);
        }

        if (targetData.audio) {
            targetData.audioFinished = false; 
            targetData.audio.currentTime = 0;
            targetData.audio.volume = 1.0;
            targetData.audio.play().catch(err => console.log(err));
        }

        triggerPulse(t.clientX, t.clientY);
    }
}, { passive: false });

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        activeDots.forEach(d => {
            if (d.audio && !d.audio.paused) d.audio.pause();
        });
    }
});