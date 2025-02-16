import fs from "fs";
import path from "path";

// 1. Define the output directory and file path.
const outputDir = path.join("src", "data");
const outputPath = path.join(outputDir, "resortsNew.json");

// Ensure the output directory exists; if not, create it.
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 2. Paste your entire tab-delimited table (including the header row) here:
const tableText = `Resort Name	State	City	Website	Snowstick 	Lattitude	Longitude	Epic	Ikon	Mountain Collective 	Indy Pass
Arizona Snowbowl	Arizona	Flagstaff	https://snowbowl.ski	https://snowbowl.ski/mountain/webcams	35.3307	-111.7095	FALSE	FALSE	FALSE	FALSE
Attitash	New Hampshire	Bartlett	https://www.attitash.com	N/A	44.0863	-71.2233	TRUE	FALSE	FALSE	FALSE
Bear Creek Mountain Resort	Pennsylvania	Macungie	https://www.bcmountainresort.com	https://www.bcmountainresort.com/webcam	40.4799	-75.6202	FALSE	FALSE	FALSE	FALSE
Beech Mountain Resort	North Carolina	Beech Mountain	https://www.beechmountainresort.com	https://www.beechmountainresort.com/activities/live-cameras	36.1949	-81.8723	FALSE	FALSE	FALSE	FALSE
Belleayre	New York	Highmount	https://www.belleayre.com	https://www.belleayre.com/cams	42.1357	-74.5001	FALSE	FALSE	FALSE	FALSE
Big Boulder	Pennsylvania	Lake Harmony	https://www.jfbb.com	N/A	41.0502	-75.6002	TRUE	FALSE	FALSE	FALSE
Big Moose Mountain	Maine	Greenville	http://www.skijmr.com	N/A	45.4979	-69.6619	FALSE	FALSE	FALSE	FALSE
Big Powderhorn Mountain	Michigan	Bessemer	https://bigpowderhorn.net	https://bigpowderhorn.net/webcams	46.5155	-90.0991	FALSE	FALSE	FALSE	FALSE
Bittersweet Ski Area	Michigan	Otsego	https://www.skibittersweet.com	N/A	42.4827	-85.7221	FALSE	FALSE	FALSE	FALSE
Black Mountain	New Hampshire	Jackson	https://blackmt.com	https://blackmt.com/about-us/live-mountain-cams	44.1622	-71.1463	FALSE	FALSE	FALSE	TRUE
Blue Hills Ski Area	Massachusetts	Canton	https://bluehillsboston.com	N/A	42.2181	-71.1108	FALSE	FALSE	FALSE	FALSE
Blue Knob	Pennsylvania	Claysburg	https://blueknob.com	https://blueknob.com/mountain-cam	40.2978	-78.5491	FALSE	FALSE	FALSE	TRUE
Blue Mountain Resort	Pennsylvania	Palmerton	https://www.skibluemt.com	https://www.skibluemt.com/conditions-cams	40.8115	-75.5157	FALSE	FALSE	FALSE	FALSE
Bluewood	Washington	Dayton	https://bluewood.com	https://bluewood.com/webcams	46.068	-117.8522	FALSE	FALSE	FALSE	TRUE
Bolton Valley	Vermont	Bolton Valley	https://www.boltonvalley.com	https://www.boltonvalley.com/the-mountain/webcams	44.422	-72.85	FALSE	FALSE	FALSE	TRUE
Boreal Mountain Resort	California	Soda Springs	https://www.rideboreal.com	https://www.rideboreal.com/the-mountain/webcams	39.3369	-120.3509	FALSE	FALSE	FALSE	FALSE
Boston Mills	Ohio	Peninsula	https://www.bmbw.com	N/A	41.2492	-81.5553	TRUE	FALSE	FALSE	FALSE
Bousquet Ski Area	Massachusetts	Pittsfield	https://bousquetmountain.com	https://bousquetmountain.com/bousquet-live-cam	42.4237	-73.2636	FALSE	FALSE	FALSE	TRUE
Bradford Ski Area	Massachusetts	Haverhill	https://www.skibradford.com	N/A	42.7647	-71.0683	FALSE	FALSE	FALSE	FALSE
Brandywine	Ohio	Peninsula	https://www.bmbw.com/brandywine	N/A	41.2601	-81.5288	TRUE	FALSE	FALSE	FALSE
Brantling Ski Slopes	New York	Sodus	https://brantling.com	N/A	43.1927	-77.1544	FALSE	FALSE	FALSE	FALSE
Brian Head Resort	Utah	Brian Head	https://www.brianhead.com	https://www.brianhead.com/webcams	37.7032		FALSE	FALSE	FALSE	FALSE
Bristol Mountain	New York	Canandaigua	https://www.bristolmountain.com	https://www.bristolmountain.com/conditions-cams	42.7465	-77.4054	FALSE	FALSE	FALSE	FALSE
Bromley Mountain	Vermont	Peru	https://www.bromley.com	https://www.bromley.com/mountain/mountain-cams	43.2135	-72.9349	FALSE	FALSE	FALSE	FALSE
Bryce Resort	Virginia	Basye-Bryce Mountain	https://bryceresort.com	https://bryceresort.com/the-resort/webcams	38.8204	-78.7653	FALSE	FALSE	FALSE	FALSE
Buck Hill	Minnesota	Burnsville	https://buckhill.com	https://buckhill.com/weather-webcams	44.7253	-93.2901	FALSE	FALSE	FALSE	FALSE
Buffalo Ski Club Ski Area	New York	Colden	https://www.buffaloskiclub.com	N/A	42.6724	-78.6825	FALSE	FALSE	FALSE	TRUE
Burke Mountain	Vermont	East Burke	https://burkemountain.com	https://burkemountain.com/the-mountain/webcams	44.5871	-71.8912	FALSE	FALSE	FALSE	FALSE
Caberfae Peaks	Michigan	Cadillac	https://caberfaepeaks.com	https://caberfaepeaks.com/web-cams	44.2469	-85.7248	FALSE	FALSE	FALSE	FALSE
Camden Snow Bowl	Maine	Camden	https://camdensnowbowl.com	https://www.camdensnowbowl.com/about/live-webcams	44.248	-69.1398	FALSE	FALSE	FALSE	FALSE
Camelback Mountain Resort	Pennsylvania	Tannersville	https://www.camelbackresort.com	https://www.camelbackresort.com/ski-tube/conditions-cams	41.0524	-75.3559	FALSE	FALSE	FALSE	FALSE
Cannonsburg	Michigan	Belmont	https://cannonsburg.com	https://cannonsburg.com/mountain-cams	43.0521	-85.4878	FALSE	FALSE	FALSE	FALSE
Cascade Mountain	Wisconsin	Portage	https://www.cascademountain.com	https://www.cascademountain.com/conditions-cams	43.5087	-89.53	FALSE	FALSE	FALSE	FALSE
Cataloochee Ski Area	North Carolina	Maggie Valley	https://cataloochee.com	https://cataloochee.com/mountain/webcams	35.5637	-83.0895	FALSE	FALSE	FALSE	FALSE
Catamount	New York	Hillsdale	https://catamountski.com	https://catamountski.com/web-cams	42.1693	-73.488	FALSE	FALSE	FALSE	TRUE
Chestnut Mountain Resort	Illinois	Galena	https://www.chestnutmtn.com	https://www.chestnutmtn.com/cams	42.3196	-90.3936	FALSE	FALSE	FALSE	FALSE
Cooper	Colorado	Leadville	https://skicooper.com	https://skicooper.com/webcams	39.3605	-106.3015	FALSE	FALSE	FALSE	TRUE
Cranmore Mountain Resort	New Hampshire	North Conway	https://www.cranmore.com	https://www.cranmore.com/winter/snow-report-cams	44.0585	-71.0972	FALSE	FALSE	FALSE	FALSE
Crotched Mountain	New Hampshire	Bennington	https://www.crotchedmtn.com	N/A	43.0115	-71.8791	TRUE	FALSE	FALSE	FALSE
Dartmouth Skiway	New Hampshire	Lyme Center	https://skiway.dartmouth.edu	https://skiway.dartmouth.edu/conditions	43.7749	-72.0807	FALSE	FALSE	FALSE	FALSE
Devils Head	Wisconsin	Merrimac	https://www.devilsheadresort.com	N/A	43.4143	-89.6195	FALSE	FALSE	FALSE	FALSE
Donner Ski Ranch	California	Norden	https://www.donnerskiranch.com	https://www.donnerskiranch.com/mountain-info/webcams	39.3166	-120.3306	FALSE	FALSE	FALSE	FALSE
Dry Hill Ski Area	New York	Watertown	https://www.skidryhill.com	N/A	43.922	-75.9336	FALSE	FALSE	FALSE	FALSE
Eldora Mountain Resort	Colorado	Nederland	https://www.eldora.com	https://www.eldora.com/mountain/webcams	39.937	-105.5824	FALSE	TRUE	FALSE	FALSE
Elk Mountain Ski Resort	Pennsylvania	Union Dale	https://www.elkskier.com	http://www.elkskier.com/cams.php	41.7204	-75.5753	FALSE	FALSE	FALSE	FALSE
Giants Ridge Resort	Minnesota	Biwabik	https://www.giantsridge.com	https://www.giantsridge.com/webcams	47.5822	-92.3032	FALSE	FALSE	FALSE	FALSE
Grand Geneva	Wisconsin	Lake Geneva	https://www.grandgeneva.com	https://www.grandgeneva.com/ski-snow-sports/ski-resort-webcam	42.6227	-88.4063	FALSE	FALSE	FALSE	FALSE
Greek Peak	New York	Virgil	https://greekpeak.net	https://greekpeak.net/web-cams	42.5085	-76.1379	FALSE	FALSE	FALSE	FALSE
Gunstock	New Hampshire	Gilford	https://www.gunstock.com	https://www.gunstock.com/mountain/webcams	43.5425	-71.3638	FALSE	FALSE	FALSE	FALSE
Hatley Pointe	North Carolina	Unknown	https://www.hatleypointe.com	N/A	35.9384	-82.5284	FALSE	FALSE	FALSE	FALSE
Hidden Valley Ski Area	Missouri	Wildwood	https://www.hiddenvalleyski.com	N/A	38.5334	-90.6465	TRUE	FALSE	FALSE	FALSE
Holiday Mountain	New York	Monticello	https://holidaymtn.com	N/A	41.6551	-74.6378	FALSE	FALSE	FALSE	FALSE
Holiday Valley	New York	Ellicottville	https://www.holidayvalley.com	https://www.holidayvalley.com/mountain/webcams	42.2662	-78.6694	FALSE	FALSE	FALSE	FALSE
Holimont Ski Area	New York	Ellicottville	https://holimont.com	https://holimont.com/winter/slope-cams	42.2692	-78.6849	FALSE	FALSE	FALSE	FALSE
Howelsen Hill	Colorado	Steamboat Springs	https://www.steamboatsprings.net/131/Howelsen-Hill	https://www.steamboatsprings.net/131/Howelsen-Hill	40.4834	-106.8322	FALSE	FALSE	FALSE	FALSE
Hunt Hollow Ski Club	New York	Naples	https://hunthollow.com	N/A	42.7114	-77.3775	FALSE	FALSE	FALSE	FALSE
Hyland Ski & Snowboard Area	Minnesota	Bloomington	https://www.threeriversparks.org/location/hyland-hills-ski-area	https://www.threeriversparks.org/location/hyland-hills-ski-area	44.8323	-93.378	FALSE	FALSE	FALSE	FALSE
Jack Frost	Pennsylvania	White Haven	https://www.jfbb.com/jack-frost	N/A	41.105	-75.6027	TRUE	FALSE	FALSE	FALSE
Kelly Canyon Ski Area	Idaho	Ririe	https://skikelly.com	N/A	43.6352	-111.6834	FALSE	FALSE	FALSE	FALSE
King Pine	New Hampshire	East Madison	https://www.kingpine.com	https://www.kingpine.com/the-mountain/webcams	43.889	-71.0924	FALSE	FALSE	FALSE	FALSE
Kissing Bridge	New York	Glenwood	https://www.kbski.com	N/A	42.5983	-78.6796	FALSE	FALSE	FALSE	FALSE
Liberty	Pennsylvania	Fairfield	https://www.libertymountainresort.com	N/A	39.7646	-77.375	TRUE	FALSE	FALSE	FALSE
Little Switzerland	Wisconsin	Slinger	https://www.littleswitz.com	https://www.littleswitz.com/cams	43.3366	-88.2791	FALSE	FALSE	FALSE	FALSE
Lost Trail - Powder Mtn	Montana	Conner	https://www.losttrail.com	https://www.losttrail.com/conditions	45.6934	-113.9539	FALSE	FALSE	FALSE	FALSE
Lost Valley	Maine	Auburn	https://www.lostvalleyski.com	https://www.lostvalleyski.com/webcam	44.1527	-70.2911	FALSE	FALSE	FALSE	TRUE
Mad River Glen	Vermont	Fayston	https://www.madriverglen.com	https://www.madriverglen.com/webcams	44.2021	-72.9173	FALSE	FALSE	FALSE	FALSE
Mad River Mountain	Ohio	Zanesfield	https://www.skimadriver.com	N/A	40.3151	-83.5337	TRUE	FALSE	FALSE	FALSE
Magic Mountain	Vermont	Londonderry	https://magicmtn.com	https://magicmtn.com/webcams	43.2063	-72.772	FALSE	FALSE	FALSE	TRUE
Magic Mountain Ski Area	Idaho	Hansen	https://magicmountainresort.com	https://magicmountainresort.com/webcam	42.3329	-114.2945	FALSE	FALSE	FALSE	FALSE
Maple Ski Ridge	New York	Schenectady	https://mapleskiridge.com	https://mapleskiridge.com/conditions	42.8442	-73.9971	FALSE	FALSE	FALSE	FALSE
Marquette Mountain	Michigan	Marquette	https://marquettemountain.com	https://marquettemountain.com/conditions	46.5135	-87.4752	FALSE	FALSE	FALSE	FALSE
McCauley Mountain Ski Center	New York	Old Forge	https://mccauleyny.com	http://www.mccauleyny.com/index.php/trail-report/web-cam	43.7197	-74.9857	FALSE	FALSE	FALSE	FALSE
Mohawk Mountain	Connecticut	Cornwall	https://www.mohawkmtn.com	https://www.mohawkmtn.com/mountain/webcam	41.8457	-73.3259	FALSE	FALSE	FALSE	FALSE
Mont Ripley	Michigan	Hancock	https://www.mtu.edu/mont-ripley	https://www.mtu.edu/mont-ripley/cams	47.1263	-88.5685	FALSE	FALSE	FALSE	FALSE
Montage Mountain	Pennsylvania	Scranton	https://www.montagemountainresorts.com	https://www.montagemountainresorts.com/webcam	41.3547	-75.6633	FALSE	FALSE	FALSE	FALSE
Montana Snowbowl	Montana	Missoula	https://www.montanasnowbowl.com	https://www.montanasnowbowl.com/snow-report/webcams	47.0243	-113.9954	FALSE	FALSE	FALSE	FALSE
Mount Holly	Michigan	Holly	https://skimtholly.com	https://skimtholly.com/webcams	42.7896	-83.5698	FALSE	FALSE	FALSE	FALSE
Mount La Crosse	Wisconsin	La Crosse	https://www.mtlacrosse.com	https://www.mtlacrosse.com/web-cam	43.751	-91.1611	FALSE	FALSE	FALSE	FALSE
Mount Peter Ski Area	New York	Warwick	https://mtpeter.com	https://www.mtpeter.com/the-mountain/webcams	41.239	-74.2861	FALSE	FALSE	FALSE	FALSE
Mount Pleasant of Edinboro	Pennsylvania	Edinboro	https://www.skimountpleasant.com	N/A	41.883	-80.1113	FALSE	FALSE	FALSE	FALSE
Mount Snow	Vermont	West Dover	https://www.mountsnow.com	https://www.mountsnow.com/the-mountain/mountain-cams	42.9606	-72.9209	TRUE	FALSE	FALSE	FALSE
Mount Southington Ski Area	Connecticut	Plantsville	https://mountsouthington.com	https://mountsouthington.com/mountain-cams	41.5829	-72.9038	FALSE	FALSE	FALSE	FALSE
Mount Sunapee	New Hampshire	Newbury	https://www.mountsunapee.com	https://www.mountsunapee.com/the-mountain/mountain-conditions/webcams.aspx	43.3266	-72.0802	TRUE	FALSE	FALSE	FALSE
Mountain Creek Resort	New Jersey	Vernon	https://www.mountaincreek.com	https://www.mountaincreek.com/plan-your-trip/webcams	41.1898	-74.5084	FALSE	FALSE	FALSE	FALSE
Mt. Abram Ski Resort	Maine	Greenwood	https://www.mtabram.com	https://www.mtabram.com/webcams	44.3817	-70.7134	FALSE	FALSE	FALSE	TRUE
Mt. Baker	Washington	Deming	https://www.mtbaker.us	https://www.mtbaker.us/snow-report/webcams	48.8584	-121.8147	FALSE	FALSE	FALSE	FALSE
Mt. Brighton	Michigan	Brighton	https://www.mtbrighton.com	N/A	42.5419	-83.8265	TRUE	FALSE	FALSE	FALSE
Mt. Crescent Ski Area	Iowa	Crescent	https://www.skicrescent.com	https://www.skicrescent.com/webcam	41.4254	-95.8626	FALSE	FALSE	FALSE	FALSE
Mt. Hood Skibowl	Oregon	Government Camp	https://www.skibowl.com	https://www.skibowl.com/webcams	45.3033	-121.7757	FALSE	FALSE	FALSE	FALSE
Mt. Rose - Ski Tahoe	Nevada	Reno	https://www.mtrose.com	https://www.mtrose.com/the-mountain/webcams	39.3288	-119.8855	FALSE	FALSE	FALSE	FALSE
Mt. Spokane Ski and Snowboard Park	Washington	Mead	https://www.mtspokane.com	https://www.mtspokane.com/webcams	47.9218	-117.0982	FALSE	FALSE	FALSE	TRUE
Nashoba Valley	Massachusetts	Westford	https://skinashoba.com	https://skinashoba.com/lifts-trails/weather-cam	42.5444	-71.4248	FALSE	FALSE	FALSE	FALSE
New Hermon Mountain	Maine	Hermon	https://www.skihermonmountain.com	https://www.skihermonmountain.com	44.7681	-68.925	FALSE	FALSE	FALSE	FALSE
Nordic Mountain	Wisconsin	Wild Rose	https://www.nordicmountain.com	https://www.nordicmountain.com/trail-report	44.1655	-89.1979	FALSE	FALSE	FALSE	TRUE
Nordic Valley Resort	Utah	Eden	https://nordicvalley.ski	N/A	41.3108	-111.8388	FALSE	FALSE	FALSE	FALSE
Norway Mountain	Michigan	Norway	https://www.norwaymountain.com	N/A	45.7985	-87.9047	FALSE	FALSE	FALSE	FALSE
Nubs Nob Ski Area	Michigan	Harbor Springs	https://www.nubsnob.com	https://www.nubsnob.com/weather-conditions/nubs-nob-webcam	45.4646	-84.9266	FALSE	FALSE	FALSE	FALSE
Ober Mountain Ski Area & Adventure Park	Tennessee	Gatlinburg	https://obergatlinburg.com	https://obergatlinburg.com/webcams/	35.7037	-83.5244	FALSE	FALSE	FALSE	FALSE
Otis Ridge Ski Area	Massachusetts	Otis	https://otisridge.com	N/A	42.2052	-73.1053	FALSE	FALSE	FALSE	FALSE
Pats Peak	New Hampshire	Henniker	https://www.patspeak.com	https://www.patspeak.com/The-Mountain/Conditions-Cams	43.1631	-71.7986	FALSE	FALSE	FALSE	FALSE
Peek'n Peak	New York	Clymer	https://www.pknpk.com	https://pknpk.com/ski	42.0673	-79.7351	FALSE	FALSE	FALSE	FALSE
Perfect North Slopes	Indiana	Lawrenceburg	https://www.perfectnorth.com	https://www.perfectnorth.com/conditions	39.1633	-84.8515	FALSE	FALSE	FALSE	FALSE
Pico Mountain 	Vermont	Killington	https://www.picomountain.com	https://www.picomountain.com/conditions/webcams	43.6631	-72.8421	FALSE	FALSE	FALSE	FALSE
Pine Knob Ski Resort	Michigan	Clarkston	https://pineknobskitwp.com	https://pineknobskitwp.com/index.php/hours-report	42.7473	-83.3708	FALSE	FALSE	FALSE	FALSE
Pine Mountain	Michigan	Iron Mountain	https://www.pinemountainresort.com	https://www.pinemountainresort.com/resort/webcam	45.8423	-88.0703	FALSE	FALSE	FALSE	FALSE
Pleasant Mountain	Maine	Bridgton	https://www.pleasantmountain.com	https://www.pleasantmountain.com/mountain/mountain-conditions/webcams	44.058	-70.8125	FALSE	FALSE	FALSE	FALSE
Pomerelle Mountain Resort	Idaho	Albion	https://pomerelle.com	https://pomerelle.com/mountain-info/webcams	42.3072	-113.609	FALSE	FALSE	FALSE	FALSE
Porcupine Mountains Winter Sports Complex	Michigan	Ontonagon	https://porkies.ski	N/A	46.8153	-89.6875	FALSE	FALSE	FALSE	FALSE
Powder Ridge Park	Connecticut	Middlefield	https://powderridgepark.com	https://powderridgepark.com/the-mountain/live-cams	41.5124	-72.7061	FALSE	FALSE	FALSE	FALSE
Powder Ridge Ski Area	Minnesota	Kimball	https://www.powderridge.com	https://www.powderridge.com/conditions	45.3357	-94.2975	FALSE	FALSE	FALSE	FALSE
Powderhorn	Colorado	Mesa	https://www.powderhorn.com	https://www.powderhorn.com/the-mountain/webcams	39.0696	-108.1505	FALSE	FALSE	FALSE	FALSE
Ragged Mountain Resort	New Hampshire	Danbury	https://www.raggedmountainresort.com	https://www.raggedmountainresort.com/web-cams	43.4893	-71.8474	FALSE	FALSE	FALSE	TRUE
Red River	New Mexico	Red River	https://www.redriverskiarea.com	https://www.redriverskiarea.com/mountain/webcams/	36.7085	-105.4061	FALSE	FALSE	FALSE	FALSE
Roundtop Mountain Resort	Pennsylvania	Lewisberry	https://www.skiroundtop.com	N/A	40.1116	-76.9271	TRUE	FALSE	FALSE	FALSE
Saskadena Six	Vermont	South Pomfret	https://www.saskadenasix.com	https://www.saskadenasix.com/conditions-cams	43.6873	-72.5494	FALSE	FALSE	FALSE	FALSE
Schuss Mountain at Shanty Creek	Michigan	Bellaire	https://www.shantycreek.com	https://www.shantycreek.com/ski-n-ride/conditions-cams	44.9482	-85.1004	FALSE	FALSE	FALSE	FALSE
Seven Oaks	Iowa	Boone	https://sevenoaksrec.com	https://sevenoaksrec.com/webcam/	42.0405	-93.9263	FALSE	FALSE	FALSE	FALSE
Seven Springs	Pennsylvania	Champion	https://www.7springs.com	https://www.7springs.com/plan-your-trip/webcams/	40.0222	-79.2951	TRUE	FALSE	FALSE	FALSE
Shawnee Mountain Ski Area	Pennsylvania	East Stroudsburg	https://www.shawneemt.com	https://www.shawneemt.com/about-shawnee/web-cams	41.0403	-75.0664	FALSE	FALSE	FALSE	FALSE
Silverton Mountain	Colorado	Silverton	https://silvertonmountain.com	https://silvertonmountain.com/mountain-info/	37.8844	-107.6649	FALSE	FALSE	FALSE	FALSE
Sipapu Ski Resort	New Mexico	Vadito	https://www.sipapu.ski	https://www.sipapu.ski/sipapu-webcams	36.1538	-105.2158	FALSE	FALSE	FALSE	FALSE
Ski Big Bear	Pennsylvania	Lackawaxen	https://ski-bigbear.com	https://ski-bigbear.com/skiing-riding/hours-conditions	41.5231	-75.0441	FALSE	FALSE	FALSE	FALSE
Ski Brule	Michigan	Iron River	https://skibrule.com	https://skibrule.com/conditions-cams	46.4583	-88.6456	FALSE	FALSE	FALSE	FALSE
Ski Butternut	Massachusetts	Great Barrington	https://www.skibutternut.com	https://www.skibutternut.com/the-mountain/webcams	42.184	-73.3164	FALSE	FALSE	FALSE	FALSE
Ski Granby Ranch	Colorado	Granby	https://granbyranch.com	https://granbyranch.com/the-mountain/webcams/	40.0442	-105.9039	FALSE	FALSE	FALSE	FALSE
Ski Sundown	Connecticut	New Hartford	https://www.skisundown.com	https://www.skisundown.com/the-mountain/webcams	41.8844	-72.9687	FALSE	FALSE	FALSE	FALSE
Ski Ward	Massachusetts	Shrewsbury	https://www.skiward.com	https://www.skiward.com/conditions	42.2983	-71.7354	FALSE	FALSE	FALSE	FALSE
Smugglers' Notch Resort	Vermont	Jeffersonville	https://www.smuggs.com	https://www.smuggs.com/pages/winter/skiride/hugsmuggs.php	44.5881	-72.7903	FALSE	FALSE	FALSE	FALSE
Snow Ridge	New York	Turin	https://www.snowridge.com	https://snowridge.com/webcams	43.6255	-75.4093	FALSE	FALSE	FALSE	FALSE
Snow Snake Mountain Ski Area	Michigan	Harrison	https://www.snowsnake.net	https://www.snowsnake.net/snow-report	44.0358	-84.7546	FALSE	FALSE	FALSE	FALSE
Snow Trails	Ohio	Mansfield	https://www.snowtrails.com	https://snowtrails.com/web-cams	40.672	-82.5575	TRUE	FALSE	FALSE	FALSE
Snow Valley	California	Running Springs	https://snow-valley.com	https://snow-valley.com/resort-information/webcams/	34.2255	-117.036	FALSE	FALSE	FALSE	FALSE
Snowriver Mountain Resort	Michigan	Wakefield	https://www.snowriver.com	https://www.bigsnow.com/conditions-cams	46.4895	-89.9787	FALSE	FALSE	FALSE	FALSE
Snowy Range Ski & Recreation Area	Wyoming	Centennial	https://snowyrangeski.com	https://www.snowyrangeski.com/the-mountain/webcams	41.3453	-106.1752	FALSE	FALSE	FALSE	FALSE
Soda Springs	California	Soda Springs	https://www.skisodasprings.com	https://www.skisodasprings.com/the-mountain/webcams	39.3383	-120.3805	FALSE	FALSE	FALSE	FALSE
Spring Mountain Ski Area	Pennsylvania	Spring Mount	https://springmountainadventures.com	https://springmountainadventures.com/conditions	40.2726	-75.4579	FALSE	FALSE	FALSE	FALSE
Stevens Pass Resort	Washington	Skykomish	https://www.stevenspass.com	https://www.stevenspass.com/the-mountain/mountain-conditions/webcams.aspx	47.7446	-121.0898	TRUE	FALSE	FALSE	FALSE
Stratton Mountain	Vermont	Stratton	https://www.stratton.com	https://www.stratton.com/the-mountain/mountain-information/webcams	43.1147	-72.9089	FALSE	TRUE	FALSE	FALSE
Sugar Mountain Resort	North Carolina	Sugar Mountain	https://www.skisugar.com	https://www.skisugar.com/live-webcam	36.128	-81.8704	FALSE	FALSE	FALSE	FALSE
Sunburst	Wisconsin	Kewaskum	https://skisunburst.com	https://skisunburst.com/webcams/	43.4842	-88.2311	FALSE	FALSE	FALSE	FALSE
Sundance	Utah	Sundance	https://www.sundance.com	https://www.sundance.com/mountain-cams/	40.392	-111.5817	FALSE	FALSE	FALSE	FALSE
Sundown Mountain	Iowa	Dubuque	https://www.sundownmtn.com	https://www.sundownmtn.com/mountain-cams/	42.521	-90.7824	FALSE	FALSE	FALSE	FALSE
Sunlight Mountain Resort	Colorado	Glenwood Springs	https://sunlightmtn.com	https://sunlightmtn.com/winter-mountain-info/webcams	39.3995	-107.3169	FALSE	FALSE	FALSE	FALSE
Sunrise Park Resort	Arizona	Greer	https://www.sunrise.ski	https://www.sunrise.ski/cams	33.9701	-109.561	FALSE	FALSE	FALSE	FALSE
Swain	New York	Swain	https://swain.com	https://swain.com/the-mountain/webcams	42.48	-77.8565	FALSE	FALSE	FALSE	TRUE
Swiss Valley	Michigan	Jones	https://www.skiswissvalley.com	https://www.skiswissvalley.com/web-cams	41.9279	-85.7965	FALSE	FALSE	FALSE	FALSE
Tahoe Donner	California	Truckee	https://www.tahoedonner.com	https://www.tahoedonner.com/amenities/amenities/downhill-ski/conditions-cams/	39.3542	-120.2308	FALSE	FALSE	FALSE	FALSE
Teton Pass Ski Resort	Montana	Choteau	https://www.tetonpassresort.com	https://www.tetonpassresort.com/webcams/	47.9367	-112.9833	FALSE	FALSE	FALSE	FALSE
The Highlands	Michigan	Harbor Springs	https://www.highlandsharborsprings.com	https://www.highlandsharborsprings.com/webcams	45.4641	-84.9303	FALSE	TRUE	FALSE	FALSE
Thunder Ridge	New York	Patterson	https://www.thunderridgeski.com	https://www.thunderridgeski.com/mountain-conditions	41.5104	-73.5679	FALSE	FALSE	FALSE	FALSE
Timber Ridge	Michigan	Gobles	https://www.timberridgeski.com	https://www.timberridgeski.com/live-webcam/	42.3739	-85.7623	FALSE	FALSE	FALSE	FALSE
Titus Mountain	New York	Malone	https://www.titusmountain.com	https://www.titusmountain.com/mountain-info/webcams	44.8482	-74.2881	FALSE	FALSE	FALSE	FALSE
Treetops Resort	Michigan	Gaylord	https://www.treetops.com	https://www.treetops.com/ski-activities/ski-snowboard/conditions	45.0302	-84.6127	FALSE	FALSE	FALSE	FALSE
Trollhaugen	Wisconsin	Dresser	https://www.trollhaugen.com	https://www.trollhaugen.com/webcams	45.356	-92.6303	FALSE	FALSE	FALSE	FALSE
Tussey Mountain	Pennsylvania	Boalsburg	https://www.tusseymountain.com	https://www.tusseymountain.com/winter/conditions	40.7683	-77.7741	FALSE	FALSE	FALSE	FALSE
Tyrol Basin	Wisconsin	Mount Horeb	https://tyrolbasin.com	https://tyrolbasin.com/conditions	43.0212	-89.8369	FALSE	FALSE	FALSE	FALSE
Wachusett Mountain Ski Area	Massachusetts	Princeton	https://www.wachusett.com	https://www.wachusett.com/the-mountain/mountain-info/webcams	42.5013	-71.8862	FALSE	FALSE	FALSE	FALSE
Waterville Valley	New Hampshire	Waterville Valley	https://www.waterville.com	https://www.waterville.com/webcams	43.9506	-71.4942	FALSE	FALSE	FALSE	FALSE
Welch Village	Minnesota	Welch	https://welchvillage.com	https://welchvillage.com/webcams/	44.5641	-92.7312	FALSE	FALSE	FALSE	FALSE
West Mountain	New York	Queensbury	https://westmountain.com	https://westmountain.com/conditions-cams	43.2874	-73.7154	FALSE	FALSE	FALSE	TRUE
Whaleback Mountain	New Hampshire	Enfield	https://www.whaleback.com	https://www.whaleback.com/snow-report	43.608	-72.1854	FALSE	FALSE	FALSE	TRUE
White Pine Ski Area	Wyoming	Pinedale	https://whitepineski.com	https://whitepineski.com/webcams	43.034	-109.7576	FALSE	FALSE	FALSE	FALSE
Whitecap Mountain	Wisconsin	Upson	https://whitecapresort.com	N/A	46.4092	-90.3934	FALSE	FALSE	FALSE	FALSE
Whiteface Mountain Resort	New York	Wilmington	https://whiteface.com	https://whiteface.com/mountain-info/webcams	44.3657	-73.9039	FALSE	FALSE	FALSE	FALSE
Whitetail Resort	Pennsylvania	Mercersburg	https://www.whitetailresort.com	N/A	39.7452	-77.9338	TRUE	FALSE	FALSE	FALSE
Wild Mountain Ski & Snowboard Area	Minnesota	Taylors Falls	https://www.wildmountain.com	https://www.wildmountain.com/conditions-cams	45.4836	-92.6813	FALSE	FALSE	FALSE	FALSE
Wildcat Mountain	New Hampshire	Jackson	https://www.skiwildcat.com	N/A	44.2582	-71.2031	TRUE	FALSE	FALSE	FALSE
Willard Mountain	New York	Greenwich	https://willardmountain.com	https://willardmountain.com/the-mountain/webcam	43.1228	-73.4303	FALSE	FALSE	FALSE	FALSE
Wilmot Mountain	Wisconsin	Wilmot	https://www.wilmotmountain.com	N/A	42.4982	-88.1841	TRUE	FALSE	FALSE	FALSE
Windham Mountain	New York	Windham	https://www.windhammountain.com	https://www.windhammountain.com/mountain-report/webcams	42.299	-74.2562	FALSE	FALSE	FALSE	FALSE
Winterplace Ski Resort	West Virginia	Ghent	https://www.winterplace.com	https://www.winterplace.com/web-cams	37.5967	-81.1195	FALSE	FALSE	FALSE	FALSE
Wisp	Maryland	McHenry	https://www.wispresort.com	https://www.wispresort.com/Wisp-Cams/	39.5579	-79.374	FALSE	FALSE	FALSE	FALSE
Wolf Creek Ski Area	Colorado	Pagosa Springs	https://wolfcreekski.com	https://wolfcreekski.com/webcams	37.4729	-106.7938	FALSE	FALSE	FALSE	FALSE
Woods Valley Ski Area	New York	Westernville	https://woodsvalleyskiarea.com	https://woodsvalleyskiarea.com/cams	43.3025	-75.3591	FALSE	FALSE	FALSE	TRUE
Yawgoo Valley	Rhode Island	Exeter	https://yawgoo.com	http://yawgoo.com/current-conditions	41.5167	-71.596	FALSE	FALSE	FALSE	FALSE
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										
										

`;

// 3. Helper function to convert "TRUE"/"FALSE" strings to booleans.
function boolify(value) {
  if (typeof value !== "string") return value;
  const val = value.toUpperCase();
  if (val === "TRUE") return true;
  if (val === "FALSE") return false;
  return value;
}

// 4. Split the text into lines and extract the header.
const lines = tableText.trim().split("\n");
// We trim each header so that extra spaces are removed.
const headerRow = lines[0].split("\t").map((col) => col.trim());

// 5. Process each row and build the final JSON array.
const jsonData = [];

for (let i = 1; i < lines.length; i++) {
  const row = lines[i].split("\t").map((cell) => cell.trim());
  let obj = {};

  // Map each header to its corresponding cell.
  for (let j = 0; j < headerRow.length; j++) {
    obj[headerRow[j]] = row[j] || "";
  }

  // Build the final JSON object with the desired key names and types.
  const finalObj = {
    resortName: obj["Resort Name"],
    State: obj["State"],
    City: obj["City"],
    Website: obj["Website"],
    // Handle potential extra space in the "Snowstick" header.
    snowStick: (obj["Snowstick"] || obj["Snowstick "]).trim(),
    // Convert Latitude and Longitude to numbers.
    Latitude: parseFloat(obj["Lattitude"]),
    Longitude: parseFloat(obj["Longitude"]),
    Epic: boolify(obj["Epic"]),
    Ikon: boolify(obj["Ikon"]),
    // Map the Mountain Collective field using the trimmed key.
    "Mountain Collective": boolify(obj["Mountain Collective"]),
    Indy: boolify(obj["Indy Pass"]),
    Country: "United States",
    Image: "",
  };

  jsonData.push(finalObj);
}

// 6. Write the JSON output to the file.
fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));

console.log(`JSON file created successfully at ${outputPath}`);
