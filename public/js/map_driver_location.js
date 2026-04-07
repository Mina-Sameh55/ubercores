$(document).ready(function (){

    const base_url = window.location.origin;
    $.ajax({
        url: base_url + '/zone/change_location',
        type: 'POST',
        dataType: 'JSON',
        data: {zid: 0, vid: 0},
        success: function (res){
            initMap(1, res.data, res.dri, 0, 0);
        }
    });

    $(document).on("change", '#zonedlist', function(){
        $.ajax({
            url: base_url + '/zone/change_location',
            type: 'POST',
            dataType: 'JSON',
            data: {zid: $(this).val(), vid: $("#zonevehicle").select2().val()},
            success: function (res){
                initMap(1, res.data, res.dri, res.zone);
            }
        });
    });

    $(document).on("change", '#zonevehicle', function(){
        $.ajax({
            url: base_url + '/zone/change_location',
            type: 'POST',
            dataType: 'JSON',
            data: {zid: $("#zonedlist").select2().val(), vid: $(this).val()},
            success: function (res){
                initMap(2, res.data, res.dri, res.zone);
            }
        });
    });


    let map = "", zoneid = "", AllMarker = [] 
    async function initMap(status, data, driver, zone, drstatus, update) {
        // Request needed libraries.
        
        const { Map } = await google.maps.importLibrary("maps");
        const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary( "marker" );

        let tot_dri = driver;
        if(status != "3") zoneid = zone

        if (status == 1) {

            let zone = data.lat_lon;

            let edit = zone.split(',');
            let edit_zones = [];
        
            for (let i = 0; i < edit.length; i++){
                let zon = edit[i].split(":");
                let object  = {lat: Number(zon[0]), lng: Number(zon[1])};
                edit_zones.push(object);
            }
            
            const triangleCoords = edit_zones;
            
            map = new Map(document.getElementById("map-canvas-edit"), {
                center: triangleCoords[0],
                zoom: 1,
                mapId: "4504f8b37365c3d0",
            });
    
            const bermudaTriangle = new google.maps.Polygon({
                paths: triangleCoords,
                strokeColor: "#ffff00",
                strokeOpacity: 0.8,
                strokeWeight: 3,
                fillColor: "#f9e9bc",
                fillOpacity: 0.35,
            });
    
            bermudaTriangle.setMap(map);
            infoWindow = new google.maps.InfoWindow();


            for (let i = 0; i < tot_dri.length;) {
                // const beachFlagImg = document.createElement("img");
                // beachFlagImg.style.width = "20px"; beachFlagImg.src = `../${tot_dri[i].image}`;


                const markerElement = new google.maps.marker.AdvancedMarkerElement({
                    map,
                    content: buildContent(tot_dri[i]),
                    position: { lat: Number(tot_dri[i].latitude), lng: Number(tot_dri[i].longitude) },
                    title: `${tot_dri[i].first_name} ${tot_dri[i].last_name}`,
                });
            
                markerElement.addListener("click", () => {
                    toggleHighlight(markerElement, tot_dri[i]);
                });

                // let mapd = new AdvancedMarkerElement({
                //     map,
                //     content: buildContent(tot_dri[i]),
                //     position: { lat: parseFloat(tot_dri[i].latitude), lng: parseFloat(tot_dri[i].longitude) },
                //     title: `${tot_dri[i].first_name}, ${tot_dri[i].last_name}`,

                //     // map,
                //     // position: { lat: parseFloat(tot_dri[i].latitude), lng: parseFloat(tot_dri[i].longitude) },
                //     // content: beachFlagImg
                // });

                // mapd.addListener("click", () => {
                //     toggleHighlight(AdvancedMarkerElement, tot_dri[i]);
                // });

                AllMarker.push({ id: tot_dri[i].id, data: markerElement });
                i++;
            }

            
            
        } else if (status == 2) {

            AllMarker.forEach(marker => {
                marker.data.map = null;
            });
            AllMarker = [];

            if (tot_dri.length != "0") {
                for (let i = 0; i < tot_dri.length;) {
                    // const beachFlagImg = document.createElement("img");
                    // beachFlagImg.style.width = "20px"; beachFlagImg.src = `../${tot_dri[i].image}`;
                  
                    // let mapd = new AdvancedMarkerElement({
                    //     map,
                    //     position: { lat: parseFloat(tot_dri[i].latitude), lng: parseFloat(tot_dri[i].longitude) },
                    //     content: beachFlagImg
                    // });

                    const markerElement = new google.maps.marker.AdvancedMarkerElement({
                        map,
                        content: buildContent(tot_dri[i]),
                        position: { lat: Number(tot_dri[i].latitude), lng: Number(tot_dri[i].longitude) },
                        title: `${tot_dri[i].first_name} ${tot_dri[i].last_name}`,
                    });
                
                    markerElement.addListener("click", () => {
                        toggleHighlight(markerElement, tot_dri[i]);
                    });

                    AllMarker.push({ id: tot_dri[i].id, data: markerElement });
                    i++;
                }
            }
             
        } else if (status == 3) {
            
            AllMarker.forEach(marker => {
                if (Number(marker.id) == Number(update.id)) {

                    if (drstatus == "2" || drstatus == "3") {
                        marker.data.map = null;
                    }
                    
                    if (drstatus == "1" || drstatus == "3") {
                        // const beachFlagImg = document.createElement("img");
                        // beachFlagImg.style.width = "20px"; beachFlagImg.src = `../${update.image}`;
                        // let mapd = new AdvancedMarkerElement({
                        //     map,
                        //     position: { lat: parseFloat(update.latitude), lng: parseFloat(update.longitude) },
                        //     content: beachFlagImg
                        // })

                        const markerElement = new google.maps.marker.AdvancedMarkerElement({
                            map,
                            content: buildContent(tot_dri[i]),
                            position: { lat: Number(tot_dri[i].latitude), lng: Number(tot_dri[i].longitude) },
                            title: `${tot_dri[i].first_name} ${tot_dri[i].last_name}`,
                        });
                    
                        markerElement.addListener("click", () => {
                            toggleHighlight(markerElement, tot_dri[i]);
                        });

                        AllMarker.push({ id: update.id, data: markerElement })
                    }
                }
            });

        }

    }

})

function toggleHighlight(markerView, property) {
    if (markerView.content.classList.contains("highlight")) {
        markerView.content.classList.remove("highlight");
        markerView.zIndex = null;
    } else {
        markerView.content.classList.add("highlight");
        markerView.zIndex = 1;
    }
}

function buildContent(property) {
    const content = document.createElement("div");
    content.classList.add("property");

    content.innerHTML = `<div class="icon">
                            <img src="../${property.image}" style="width: 20px;" alt="">
                        </div>
                        <div class="details">
                            <div class="price mb-2 flex-wrap">${property.first_name} ${property.last_name}</div>
                            <div class="address flex-wrap">${property.primary_ccode} ${property.primary_phoneNo}</div>
                            <div class="address flex-wrap">${property.vehicle_name}</div>
                            <div class="address flex-wrap">Zone :- ${property.zone_name}</div>
                        </div>`;
    return content;
}