/* =========================================
   1. SETTINGS & INITIALIZATION
   ========================================= */
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=0&single=true&output=csv";
let allProjectData = [];

// Start the engine
Papa.parse(sheetURL, {
    download: true,
    header: true,
    complete: function(results) {
        allProjectData = results.data;
        
        console.log("Data loaded:", allProjectData.length, "rows");

        // 1. RENDER EVERYTHING
        renderTable(allProjectData); // Builds the Archive List
        renderTags(allProjectData);  // Builds the Filter Buttons (FIXED)
        renderScene(allProjectData); // Builds the Dots (FIXED)
        
        // 2. CHECK URL (Deep Linking)
        const hash = window.location.hash;
        if (hash === '#archive') {
            openArchive();
        } else if (hash.length > 1) {
            openProject(hash.substring(1));
        }
    }
});

/* =========================================
   2. SCENE LOGIC (The Dots)
   ========================================= */
function renderScene(data) {
    const container = document.getElementById('dots-container');
    if (!container) return;

    container.innerHTML = ""; // Clear existing

    data.forEach(project => {
        // Render a dot for ANY project that has a name
        if (!project.project_name) return;

        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.title = project.project_name; // Tooltip on hover
        
        // Random Position (5% to 95%)
        const randomX = Math.floor(Math.random() * 90) + 5; 
        const randomY = Math.floor(Math.random() * 90) + 5;
        
        dot.style.left = randomX + '%';
        dot.style.top = randomY + '%';

        // CLICK LOGIC: Only open if folder exists
        if (project.folder) {
            dot.style.cursor = 'pointer'; // Hand cursor
            dot.onclick = () => openProject(project.folder);
        } else {
            dot.style.cursor = 'default'; // Arrow cursor (not ready)
            dot.style.opacity = '0.3';    // Make it faint if no folder
        }
        
        container.appendChild(dot);
    });
}

/* =========================================
   3. RENDER TAGS (The Filter Buttons)
   ========================================= */
function renderTags(data) {
    const tagBar = document.getElementById('tag-bar');
    if (!tagBar) return;
    
    tagBar.innerHTML = ""; // Clear existing

    // 1. Collect unique tags
    let allTags = new Set();
    data.forEach(project => {
        if (project.medium) {
            const tags = project.medium.split(',').map(t => t.trim());
            tags.forEach(tag => { if(tag) allTags.add(tag); });
        }
    });

    // 2. Create "All" Button
    const allBtn = document.createElement('button');
    allBtn.textContent = "all";
    allBtn.className = "tag-btn active"; 
    allBtn.onclick = function(e) { filterByTag('all', e.target); };
    tagBar.appendChild(allBtn);

    // 3. Create Tag Buttons (Sorted A-Z)
    Array.from(allTags).sort().forEach(tag => {
        const btn = document.createElement('button');
        btn.textContent = tag.toLowerCase();
        btn.className = "tag-btn";
        btn.onclick = function(e) { filterByTag(tag, e.target); };
        tagBar.appendChild(btn);
    });
}

/* =========================================
   4. RENDER TABLE (The Archive List)
   ========================================= */
function renderTable(data) {
    const tableBody = document.getElementById('database-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = ""; 

    data.forEach(project => {
        if (!project.project_name) return;

        const row = document.createElement('tr');
        row.className = 'project-row';
        
        // Check for Folder
        if (project.folder) {
            row.classList.add('has-folder'); 
            row.onclick = function() { openProject(project.folder); };
        }

        // Add Tags for Filtering
        const mediumData = project.medium ? project.medium : "";
        row.setAttribute('data-tags', mediumData);

        // Create Columns
        const columns = [
            project.project_id, project.project_name, project.year,
            project.place, project.institution, project.collaborators
        ];

        columns.forEach(text => {
            const cell = document.createElement('td');
            cell.textContent = text || "";
            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });
}

/* =========================================
   5. INTERACTION (Filtering & Sorting)
   ========================================= */
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
}

function sortTable(columnIndex) {
    const table = document.getElementById("artist-database");
    let switching = true;
    let direction = "asc"; 
    let switchCount = 0;
    
    while (switching) {
        switching = false;
        const rows = table.rows;
        let i, shouldSwitch;
        
        for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            const x = rows[i].getElementsByTagName("TD")[columnIndex];
            const y = rows[i + 1].getElementsByTagName("TD")[columnIndex];
            
            const xContent = x.textContent.trim().toLowerCase();
            const yContent = y.textContent.trim().toLowerCase();
            
            const xNum = parseFloat(xContent);
            const yNum = parseFloat(yContent);
            const isNumeric = !isNaN(xNum) && !isNaN(yNum);

            if (direction === "asc") {
                if (isNumeric ? xNum > yNum : xContent > yContent) { shouldSwitch = true; break; }
            } else if (direction === "desc") {
                if (isNumeric ? xNum < yNum : xContent < yContent) { shouldSwitch = true; break; }
            }
        }
        
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
            switchCount++;
        } else {
            if (switchCount === 0 && direction === "asc") { direction = "desc"; switching = true; }
        }
    }
}

/* =========================================
   6. OVERLAY LOGIC (Open/Close)
   ========================================= */
function openArchive() {
    document.getElementById('archive-overlay').style.display = 'flex';
    window.location.hash = 'archive';
}

function closeArchive() {
    document.getElementById('archive-overlay').style.display = 'none';
    history.pushState("", document.title, window.location.pathname);
}

function openProject(folderName) {
    if (!folderName) return;
    const project = allProjectData.find(p => p.folder === folderName);
    
    if (project) {
        window.location.hash = folderName;
        document.getElementById('popup-title').textContent = project.project_name;
        document.getElementById('popup-meta').textContent = `${project.year} — ${project.medium}`;
        document.getElementById('popup-description').textContent = project.description || "";
        document.getElementById('project-overlay').style.display = "flex";
    }
}

function closeProject() {
    document.getElementById('project-overlay').style.display = "none";
    const archiveIsVisible = document.getElementById('archive-overlay').style.display === 'flex';
    
    if (archiveIsVisible) {
        window.location.hash = 'archive';
    } else {
        history.pushState("", document.title, window.location.pathname);
    }
}

// Window Click (Close on Glass)
window.onclick = function(event) {
    const projectOverlay = document.getElementById('project-overlay');
    const archiveOverlay = document.getElementById('archive-overlay');

    if (event.target === projectOverlay) {
        closeProject();
    } else if (event.target === archiveOverlay) {
        closeArchive();
    }
}