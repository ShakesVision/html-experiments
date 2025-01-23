const fs = require('fs');
const path = require('path');

const baseURL = 'https://shakesvision.github.io/html-experiments/';
const outputMarkdown = 'README.md'; // Markdown file to update
const projectRoot = __dirname;

function generateMarkdownLinks() {
    const folders = fs.readdirSync(projectRoot, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && fs.existsSync(path.join(projectRoot, dirent.name, 'index.html')))
        .map(dirent => dirent.name);

    let links = [];
    folders.forEach(folder => {
        const projectURL = `${baseURL}${folder}/index.html`;
        links.push(`- [${folder}](${projectURL})`);
    });

    return links;
}

function updateMarkdownFile() {
    // Read the existing markdown file
    let existingContent = '';
    if (fs.existsSync(outputMarkdown)) {
        existingContent = fs.readFileSync(outputMarkdown, 'utf-8');
    }

    const existingLinks = new Set(
        existingContent
            .split('\n') // Split by lines
            .filter(line => line.startsWith('- [')) // Keep only lines that are project links
    );

    const newLinks = generateMarkdownLinks().filter(link => !existingLinks.has(link));

    if (newLinks.length > 0) {
        const newContent = newLinks.join('\n') + '\n';
        fs.appendFileSync(outputMarkdown, newContent);
        console.log(`Added ${newLinks.length} new projects to ${outputMarkdown}.`);
    } else {
        console.log('No new projects to add.');
    }
}

updateMarkdownFile();
