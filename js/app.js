document.addEventListener("DOMContentLoaded", () => {

    const btnGPS = document.getElementById("gps");
    const btnBuscar = document.getElementById("buscar");
    const btnRota = document.getElementById("rota");

    const frete = document.getElementById("frete");
    const regiao = document.getElementById("regiao");
    const distancia = document.getElementById("distancia");
    const tempo = document.getElementById("tempo");
    const endereco = document.getElementById("endereco");

    let latitude = null;
    let longitude = null;

    btnGPS.addEventListener("click", () => {

        if (!navigator.geolocation) {
            alert("Seu navegador não suporta localização.");
            return;
        }

        navigator.geolocation.getCurrentPosition(

            (pos) => {

                latitude = pos.coords.latitude;
                longitude = pos.coords.longitude;

                endereco.value =
                    latitude.toFixed(6) + ", " +
                    longitude.toFixed(6);

                alert("Localização obtida com sucesso.");

            },

            () => {

                alert("Não foi possível obter sua localização.");

            }

        );

    });

    btnBuscar.addEventListener("click", () => {

        if (endereco.value.trim() === "") {

            alert("Digite um endereço.");

            return;

        }

        frete.textContent = "Calculando...";
        regiao.textContent = "Localizando...";
        distancia.textContent = "--";
        tempo.textContent = "--";

        setTimeout(() => {

            frete.textContent = "R$ --,--";
            regiao.textContent = "Em desenvolvimento";
            distancia.textContent = "-- km";
            tempo.textContent = "-- min";

        }, 1000);

    });

    btnRota.addEventListener("click", () => {

        if (latitude && longitude) {

            window.open(
                `https://www.google.com/maps?q=${latitude},${longitude}`,
                "_blank"
            );

        } else {

            alert("Primeiro obtenha sua localização.");

        }

    });

});
