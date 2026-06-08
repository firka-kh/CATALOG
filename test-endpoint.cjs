const run = async () => {
    try {
        const res = await fetch("http://localhost:3000/api/search-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: "Автоматический прибор для снятия гель-лака" })
        });
        const data = await res.json();
        console.log("Success:", data.results ? data.results.length : 0, data);
    } catch (e) {
        console.error(e);
    }
}
run();
