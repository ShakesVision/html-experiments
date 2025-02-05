document.addEventListener("DOMContentLoaded", function () {
    const header = document.createElement("div");
    header.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; background: #572828; color: white; padding: 10px; text-align: center; font-size: 18px; z-index: 1000;">
            <a href="../index.html" style="color: white; text-decoration: none; font-weight: bold;"> Return to Home</a>
        </div>
        <div style="margin-top: 50px;"></div>
    `;
    document.body.insertAdjacentElement("afterbegin", header);
});
