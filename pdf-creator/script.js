// Get the image grid element
const imageGrid = document.querySelector('.grid');

// Get the configuration form elements
const orientationSelect = document.getElementById('orientation');
const pageSizeSelect = document.getElementById('pageSize');
const marginSelect = document.getElementById('margin');
const compressionSelect = document.getElementById('compression');

// Get the add page and generate pdf buttons
const addPageButton = document.getElementById('add-page');
const generatePdfButton = document.getElementById('generate-pdf');

// Initialize an empty array to store the selected images
let selectedImages = [];

// Add event listener to the add page button
addPageButton.addEventListener('click', () => {
    // Create a new input element to select images
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';

    // Add event listener to the input element
    input.addEventListener('change', (e) => {
        // Get the selected images
        const images = e.target.files;

        // Add the selected images to the grid
        images.forEach((image) => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(image);
            imageGrid.appendChild(img);
            selectedImages.push(image);
        });

        // Clear the input element
        input.value = '';
    });

    // Add event listener to the generate pdf button
    generatePdfButton.addEventListener('click', () => {
        // Get the selected configuration options
        const orientation = orientationSelect.value;
        const pageSize = pageSizeSelect.value;
        const margin = marginSelect.value;
        const compression = compressionSelect.value;

        // Create a new PDF document
        const pdf = new jsPDF(orientation, 'mm', pageSize);

        // Add the selected images to the PDF document
        selectedImages.forEach((image, index) => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(image);
            pdf.addImage(img, 'JPEG', 0, 0, image.width, image.height, '', 'FAST');
            if (index < selectedImages.length - 1) {
                pdf.addPage();
            }
        });

        // Set the PDF document properties
        pdf.setProperties({
            title: 'Image to PDF',
            subject: 'Converted images',
            author: 'Your Name',
            creator: 'Your Name',
        });

        // Save the PDF document
        pdf.save('image_to_pdf.pdf');
    });
});