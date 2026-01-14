export async function LoadExportCSV() {
  const exportBtn = document.getElementById("export-btn");

  exportBtn.addEventListener("click", async () => {
    try {
        const res = await fetch("/api/export/scrobbles");

        if (!res.ok) {
          throw new Error("Export failed");
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "scrobbles.csv";
        document.body.appendChild(a);
        a.click();

        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error(err);
        alert("Erro ao exportar CSV");
      }
  });

}

export async function LoadImportCSV() {
  const importBtn = document.getElementById("import-btn");
  const csvInput = document.getElementById("csv-input");
  const statusLabel = document.getElementById("import-status");

  importBtn.addEventListener("click", () => {
      csvInput.click();
  });

  csvInput.addEventListener("change", async () => {
      const file = csvInput.files[0];
      if (!file) return;

      statusLabel.textContent = "Importing...";

      const formData = new FormData();
      formData.append("file", file);

      try {
          const res = await fetch("/api/import/scrobbles", {
              method: "POST",
              body: formData,
          });

          if (!res.ok) {
              throw new Error("Import failed");
          }

          const result = await res.json();
          statusLabel.textContent = `Imported ${result.imported} rows ✔️`;

      } catch (err) {
          console.error(err);
          statusLabel.textContent = "Error importing CSV ❌";
      } finally {
          csvInput.value = "";
      }
  });
}
