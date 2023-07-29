
let svg = d3.select("svg"),
    width = +svg.node().getBoundingClientRect().width,
    height = +svg.node().getBoundingClientRect().height;

// svg objects
let canvas = svg.append('g')
   .attr("class", "canvas")
   .data([{'x':0, 'y':0}])
   .call(d3.drag() 
      .on("start", canvasdragstarted) 
      .on("drag", canvasdragged) 
      .on("end", canvasdragended))
   ;

let link, node, label, hl_link, title;

let legend =  svg.append("g")
  .attr("class", "legend")
  ; 

// the data - an object with nodes and links
let graph;

// scales
let flux_scale; // max node flux value
let diff_scale; // max difference found in diff in flux

let edgecolorScale, edgezlevelScale, nodesizeScale,
  edgewidthScale;
let get_scl_flux, get_flux; // grabs either series scale or global scale

let procdesc;

const hl_color = 'purple';
const visible_zeroflux_width = 1;
const visible_zeroflux_size = 3;


function calc_scaled(x) {
  const order = 5;
  if (x == 0 || x === undefined ) { return 0; }
  var o = Math.log10 (( Math.abs(x) / flux_scale * (10 ** order) ) );
  o = o > .2 ? o : .2;
  o = Math.sign(x) * o / order;
  return o;
}

function arrmax(x) {
  return Math.max(...x);
}
function arrmin(x) {
  return Math.min(...x);
}
function arrminmax(x) {
  let mx = arrmax(x);
  let mn = arrmax(x);
  return Math.abs(mx) > Math.abs(mn) ? mx : mn;
}

function main(fname1, fname2 = "none", prefix="none") {
  let _graph;
  if (fname2 === "none") {
    _graph = d3.json(fname1) ;
  } else {
    _graph = Promise.all([
      d3.json(fname1),
      d3.json(fname2),
      prefix,
    ])
  }
  _graph.then(work);
}

function composite_graph(data) {
  graph = {
    'directed': true, 
    'multigraph': false, 
  };
 
  let g0 = data[0]['graph'], g1 = data[1]['graph'];
  let prefix = data[2];
  if ((prefix != 'none') && Array.isArray(prefix) && (prefix.length == 2)) {
    prefix = prefix.map(x => x + ' '); 
  } else {
    prefix = ['' , '']
  }

  let len0 = g0.series_labels.length;
  let len1 = g1.series_labels.length;
  graph['graph'] = {
    'series_descs' : [ 
      ...g0.series_descs.map(x => g0.title + ', ' + x), 
      ...g1.series_descs.map(x => g1.title + ', ' + x),
    ],
    'series_labels' : [ 
      ...g0.series_labels.map(x => prefix[0] + x), 
      ...g1.series_labels.map(x => prefix[1] + x),
    ],
    'title':  g0.title + ' vs. ' + g1.title ,
    'process_desc': [ ...g0.process_desc, ...g1.process_desc.filter(x => g0.process_desc.indexOf(x) < 0)],
    'material_desc': [ ...g0.material_desc, ...g1.material_desc.filter(x => g0.material_desc.indexOf(x) < 0)],
    'oriented': g0.oriented && g1.oriented,
    'composite': true,
  };

  let oriented = graph['graph'].oriented

  let ns0 = data[0]['nodes'], ns1 = data[1]['nodes'];
  let nids = ns0.map( x => x.id);
  nids = nids.concat(ns1.map( x => x.id).filter(x => nids.indexOf(x) < 0));
  let nodes = [];

  // nodes
  for (let i=0, nid, n0, n1; i<nids.length; ++i) {
    nid = nids[i];
    n0 = ns0.filter(x => x.id == nid );
    n1 = ns1.filter(x => x.id == nid );

    if (n0.length == 0 && n1.length == 1) {
      n0 = structuredClone(n1[0]);
      n0['series_flux'] = Array(len0).fill(0);
      n0['series_flux_byproc'] = Array(len0).fill(0).map(x => new Object());
      n1 = n1[0];
    } else if (n0.length == 1 && n1.length == 0) {
      n1 = structuredClone(n0[0]);
      n1['series_flux'] = Array(len1).fill(0);
      n1['series_flux_byproc'] = Array(len1).fill(0).map(x => new Object());
      n0 = n0[0];
    } else {
      n0 = n0[0];
      n1 = n1[0];
    }

    nodes[i] = n0;
    nodes[i]['series_flux'] = [...n0.series_flux, ...n1.series_flux];
    nodes[i]['series_flux_byproc'] = [...n0.series_flux_byproc, ...n1.series_flux_byproc];
  }
  graph['nodes'] = nodes;

  // links
  let ls0 = data[0]['links'], ls1 = data[1]['links']; 
  ls0.forEach(x => {x.id = x.source + ':' + x.target});
  ls1.forEach(x => {x.id = x.source + ':' + x.target});
  let lids = ls0.map( x => x.id);
  lids = lids.concat(ls1.map( x => x.id).filter(x => lids.indexOf(x) < 0));
  let links = [];

  for (let i=0, lid, l0, l1; i<lids.length; ++i) {
    lid = lids[i];
    l0 = ls0.filter(x => x.id == lid);
    l1 = ls1.filter(x => x.id == lid);
    [src, tgt] = lid.split(':');

    if (l0.length == 0 && l1.length == 1) {
      l0 = structuredClone(l1[0]);
      l0['series_flux'] = Array(len0).fill(0);
      l0['series_flux_byproc'] = Array(len0).fill(0).map(x => new Object());
      l1 = l1[0];
    } else if (l0.length == 1 && l1.length == 0) {
      l1 = structuredClone(l0[0]);
      l1['series_flux'] = Array(len1).fill(0);
      l1['series_flux_byproc'] = Array(len1).fill(0).map(x => new Object());
      l0 = l0[0];
    } else {
      l0 = l0[0]
      l1 = l1[0]
    }

    links[i] = {
      'source': l0.source,
      'target': l0.target,
      'flux': l0['flux'],
    };
    links[i] = l0;
    links[i]['series_flux'] = [...l0.series_flux, ...l1.series_flux];
    links[i]['series_flux_byproc'] = [...l0.series_flux_byproc, ...l1.series_flux_byproc];


  }
  if (oriented) {
    // TODO flip edge if needed

    // find dual edges
    let dups = new Map();
    let ulinks = links.map( x => x.source < x.target ? x.source+':'+x.target : x.target+':'+x.source);
    links.map( x => {
      lid = x.source < x.target ? x.source+':'+x.target : x.target+':'+x.source;
      dups.set(lid, (dups.get(lid) === undefined ? 0 : dups.get(lid)) + 1);
    } );
    
    dups = [...dups.keys()].filter(x => (dups.get(x) > 1));

    // merge dual edges
    for (let i = 0, dup, lid0, lid1, link0, link1, merged, dropped; i < dups.length; ++i) {
      dup = dups[i];
      lid0 = dup.split(':')[0];
      lid1 = dup.split(':')[1];
      link0 = links.filter( x => (x.source == lid0) && (x.target == lid1 ) );
      link0 = link0[0];
      link1 = links.filter( x => (x.source == lid1) && (x.target == lid0 ) );
      link1 = link1[0];
      links.splice(links.indexOf(link0), 1);
      links.splice(links.indexOf(link1), 1);

      if (link0.flux > link1.flux) {
        merged = link0;
        dropped = link1;
      } else {
        merged = link1;
        dropped = link0;
      }
      for (let j=0, proc; j < merged.series_flux.length; ++j) {
        merged.series_flux[j] = merged.series_flux[j] - dropped.series_flux[j];
        for (const proc in dropped.series_flux_byproc[j]) {
          merged.series_flux_byproc[j][proc] = ((proc in merged.series_flux_byproc[j]) ? merged.series_flux_byproc[j] : 0) - dropped.series_flux_byproc[j][proc];
        }

      }

      links.push(merged);

    }
    
  }

  graph['links'] = links;

    
  return graph;
}

function work(data) {

  if (Array.isArray(data)) {
    graph = composite_graph(data);
  } else {
    // debugger;
    graph = data;
  }

  // if data is for series of graph, representative properties are determiend for nodes/links
  if ('series_labels' in graph.graph) {

    // rename arrays with series_ in name
    function renameKey(o, old_key, new_key) {
      Object.defineProperty(o, new_key,
        Object.getOwnPropertyDescriptor(o, old_key)); 
      delete o[old_key];
    }

    graph.nodes.forEach( function(d) { 
      if (d.flux        instanceof Array) { renameKey(d, 'flux',        'series_flux'       ); }
      if (d.flux_byproc instanceof Array) { renameKey(d, 'flux_byproc', 'series_flux_byproc'); }
      if (d.net_prod    instanceof Array) { renameKey(d, 'net_prod',    'series_net_prod'   ); }
      if (d.gross_prod  instanceof Array) { renameKey(d, 'gross_prod',  'series_gross_prod' ); }
      if (d.gross_cons  instanceof Array) { renameKey(d, 'gross_cons',  'series_gross_cons' ); }
    }
    );

    graph.links.forEach( function(d) {
      if (d.flux instanceof Array) { renameKey(d, 'flux', 'series_flux' ); } 
    }
    );
    

    // assume that there is series_flux_byprod, but not series_net_prod, series_gross_cons etc
    graph.nodes.forEach ( function (d) { 
      d.series_net_prod   = d.series_flux_byproc.map(x => Object.values(x).reduce((a,b)=>a+b, 0)); 
      d.series_gross_prod = d.series_flux_byproc.map(x => Object.values(x).reduce((a,b)=>a+Math.max(b,0), 0)); 
      d.series_gross_cons = d.series_flux_byproc.map(x => Object.values(x).reduce((a,b)=>a+Math.min(b,0), 0));
    }
    );

    // calculate representative values based on series
    graph.nodes.forEach( function(d) {
      d.flux = arrmax(d.series_flux);
      d.net_prod = arrminmax(d.series_net_prod);
      d.gross_prod = arrminmax(d.series_gross_prod);
      d.gross_cons = arrminmax(d.series_gross_cons);
    });

    graph.links.forEach( function(d) {
      d.flux = arrmax(d.series_flux); 
    });

  } else {

    d3.select('#panel_series').style('display', 'none');

  }

  // initialize vis specific properties
  //scale = graph.graph.scale;

  flux_scale = graph.nodes.map(d=>d.flux).reduce((a,b)=>a>b?a:b)

  graph.nodes.forEach( function(d) { d.scl_flux = calc_scaled(d.flux); });
  graph.nodes.forEach( function(d) { d.scl_net_prod = calc_scaled(d.net_prod); });
  graph.nodes.forEach( function(d) { d.scl_gross_prod = calc_scaled(d.gross_prod); });
  graph.nodes.forEach( function(d) { d.scl_gross_cons = calc_scaled(d.gross_cons); });
  graph.nodes.forEach( function(d) { if ('demand' in d) {d.scl_demand = calc_scaled(d.demand);} });
  graph.nodes.forEach( function(d) { if ('supply' in d) {d.scl_supply = calc_scaled(d.supply);} });

  graph.links.forEach( function(d) { d.scl_flux = calc_scaled(d.flux); });

  if ('series_labels' in graph.graph) {
    graph.nodes.forEach( function(d) { d.series_scl_flux = d.series_flux.map(calc_scaled); } );
    graph.links.forEach( function(d) { d.series_scl_flux = d.series_flux.map(calc_scaled); } );

    diff_scale = graph.links
      .map(d=>d.series_flux)
      .map(x=>Math.max(...x) - Math.min(...x))
      .reduce((a,b) => a > b ? a : b);
  }


  graph.nodes.forEach( function(d) { d.vis = {}; d.node_visible = true; d.node_visibility_elements = {}; d.label_visible = false; d.label_visibility_elements = {} } );
  graph.links.forEach( function(d) { d.vis = {}; d.link_visible = true; d.link_visibility_elements = {}; } );
  // build edge list
  graph.nodes.forEach( function(d) { d.edge_list = new Array()});
  for (var i = 0, link; i < graph.links.length; ++i ) {
    link = graph.links[i];
    link.id = link.source + ':' + link.target;
    for (var ii=0, node; ii<graph.nodes.length; ++ii) {
      node = graph.nodes[ii];
      if (node.id == link.source ) { node.edge_list.push(link.id); }
      if (node.id == link.target ) { node.edge_list.push(link.id); }
    }
  }
  // node desc (original name)
  var matdesc = {};
  if ('material_desc' in graph.graph) {
    var matdesc = Object.fromEntries(graph.graph.material_desc
      .map(function(d) { return [d.id, d.desc]})
    );
  }
  graph.nodes.forEach( function(d) { d.desc = (d.id in matdesc) ? matdesc[d.id] : d.id; } );

  // edge desc
  var procdesc = {};
  if ('process_desc' in graph.graph) {
    procdesc = Object.fromEntries(graph.graph.process_desc
      .map(function(d) { return [d.id, d.desc]})
    );
  }

  if ('dropped_nodes' in graph.graph) {
    // TODO
  } else {
    graph.graph.dropped_nodes = [];
  }

  // holder for dropped nodes
  if ('dropped_edges' in graph.graph) {
    // TODO
  } else {
    graph.graph.dropped_nodes = [];
  }
  if ('dropped_links' in graph.graph) {
    // TODO
  } else {
    graph.graph.dropped_links = [];
  }

  // construct series information
  initializeSeries();

  // set up all the visuals
  initializeDisplay();

  // start simulation
  initializeSimulation();
}

//////////// FORCE SIMULATION //////////// 

// force simulator
var simulation = d3.forceSimulation();

// set up the simulation and event to update locations after each tick
function initializeSimulation() {
  simulation.nodes(graph.nodes);
  initializeForces();
  simulation.on("tick", ticked);
}

// values for all forces
// initial values when sim starts.  controls are reflects values here at the start of sim
forceProperties = {
    center: {
      enabled: true,
        x: 0.5,
        y: 0.5
    },
    charge: {
        enabled: true,
        strength: -400,
        distanceMin: 1,
        distanceMax: 1000
    },
    collide: {
        enabled: true,
        strength: .7,
        iterations: 1,
        radius: 5
    },
    forceX: {
        enabled: false,
        strength: .1,
        x: .5
    },
    forceY: {
        enabled: false,
        strength: .1,
        y: .5
    },
    link: {
        enabled: true,
        distance: 30,
        iterations: 1
    },
    netprod: {
        enabled: false,
        strength: 3000,
      orientation: 0
    },
    grossprod: {
        enabled: true,
        strength: 500,
      orientation: 0
    }, 
    grosscons: {
        enabled: true,
        strength: 1200,
      orientation: 0
    }, 
    supplydemand: {
        enabled: true,
        strength: 400,
      orientation: 1
    },
    verysticky: {
      enabled: false,
    },

}
console.log(forceProperties);

// add forces to the simulation
function initializeForces() {
    // add forces and associate each with a name
    simulation
        .force("link", d3.forceLink())
        .force("charge", d3.forceManyBody())
        .force("collide", d3.forceCollide())
        .force("center", d3.forceCenter())
        .force("forceX", d3.forceX())
        .force("forceY", d3.forceY())
        .force("netprod", forceNetProd())
        .force("grosscons", forceGrossCons())
        .force("grossprod", forceGrossProd())
        .force("supplydemand", forceSupplyDemand())
	;

	
    // apply properties to each of the forces
    updateForces();
}

function forceNetProd( strength, orientation ) {
    // force proportional to net production
    // makes supply materials to the left, demand materials to right

  var nodes;
  if (strength === undefined) strength = 2000;
  if (orientation === undefined) orientation = 0;

  function force() {
    var i,
      n = nodes.length,
      k = simulation.alpha() * .1,
      vv,
      node;


    for (i = 0; i < n; ++i) {
      node = nodes[i];
      if ('scl_net_prod' in node) {
        vv = node.scl_net_prod;
        
        if (orientation == 0) {
          node.vx += (vv * k * strength );
        } else {
          node.vy += (vv * k * strength );
        }
      }
    }
  }

  force.initialize = function(_) {
    nodes = _;
  };

  force.strength = function(_) {
    return arguments.length ? (strength = +_, force): strength;
  };

  force.orientation = function(_) {
    return arguments.length ? (orientation = +_, force): orientation;
  };

  return force;
}

function forceGrossCons( strength, orientation ) {
    // force proportional to gross consumption
    // makes supply materials to the left

  var nodes;
  if (strength === undefined) strength = 2000;
  if (orientation === undefined) orientation = 0;

  function force() {
    var i,
      n = nodes.length,
      k = simulation.alpha() * .1,
      vv,
      node;


    for (i = 0; i < n; ++i) {
      node = nodes[i];
      if ('scl_gross_cons' in node) {
        vv = node.scl_gross_cons;
        
        if (orientation == 0) {
          node.vx += (vv * k * strength );
        } else {
          node.vy += (vv * k * strength );
        }
      }
    }
  }

  force.initialize = function(_) {
    nodes = _;
  };

  force.strength = function(_) {
    return arguments.length ? (strength = +_, force): strength;
  };

  force.orientation = function(_) {
    return arguments.length ? (orientation = +_, force): orientation;
  };

  return force;
}

function forceGrossProd( strength, orientation ) {
    // force proportional to net production
    // makes demand materials to right

  var nodes;
  if (strength === undefined) strength = 2000;
  if (orientation === undefined) orientation = 0;

  function force() {
    var i,
      n = nodes.length,
      k = simulation.alpha() * .1,
      vv,
      node;


    for (i = 0; i < n; ++i) {
      node = nodes[i];

      if ('scl_gross_prod' in node) {
        vv = node.scl_gross_prod;
        
        if (orientation == 0) {
          node.vx += (vv * k * strength );
        } else {
          node.vy += (vv * k * strength );
        }
      }
    }
  }

  force.initialize = function(_) {
    nodes = _;
  };

  force.strength = function(_) {
    return arguments.length ? (strength = +_, force): strength;
  };

  force.orientation = function(_) {
    return arguments.length ? (orientation = +_, force): orientation;
  };

  return force;
}
function forceSupplyDemand( strength, orientation ) {
    // force proportional to net production
    // makes supply materials to the left, demand materials to right

  var nodes;
  if (strength == null) strength = 400;
  if (orientation == null) orientation = 1;

  function force() {
    var i,
      n = nodes.length,
      k = simulation.alpha() * .1,
      vv,
      node;

    for (i = 0; i < n; ++i) {
      node = nodes[i];
      vv = 0;
      if ('scl_demand' in node) {
        vv +=  node.scl_demand;
      }
      if ('scl_supply' in node) {
        vv -=  node.scl_supply;
      }
        
      if (orientation == 0) {
        node.vx += (vv * k * strength );
      } else {
        node.vy += (vv * k * strength );
      }
    }
  }

  force.initialize = function(_) {
    nodes = _;
  };

  force.strength = function(_) {
    return arguments.length ? (strength = +_, force): strength;
  }

  force.orientation = function(_) {
    return arguments.length ? (orientation = +_, force): orientation;
  }

  return force;
}

function releaseSticky() {
  
  //console.log('relaseSticky()');
  node.each(function (d) {
    d.fx = null;
    d.fy = null;
  });

}

function setVerySticky(val) {
  console.log('setVerySticky()');
  if (val === undefined ) {
    val = forceProperties.verysticky.enabled;
  } else {
    forceProperties.verysticky.enabled = val;
    document.getElementById('verySticky_Enabled').checked = val;
  }

  if (val) {
    var s = 'drag to move/stick nodes.  use ctrl+drag to release node';
  } else {
    var s = 'use ctrl+drag to make node stick.  use regular drag to release node';
  }
  var elem = document.querySelectorAll('p.sticky_desc');
  //console.log(elem);
  elem.forEach(function (d) { d.innerText = s;});
}

// apply new force properties
function updateForces() {

    // get each force by name and update the properties
    simulation.force("center")
        .x(width * .5)
        .y(height * .5)
  .strength( forceProperties.center.enabled ? 1 : 0)
  ;

    simulation.force("collide")
        .radius( function(d) {return 4 + 16 * d.scl_flux});

        // smaller nodes get smaller charge
    simulation.force("charge")
        .strength( function(d) { return forceProperties.charge.strength * forceProperties.charge.enabled * d.scl_flux})
        .distanceMin(forceProperties.charge.distanceMin)
        .distanceMax(forceProperties.charge.distanceMax);

    simulation.force("link")
        .id(function(d) {return d.id;})
        .distance(forceProperties.link.distance)
        .iterations(forceProperties.link.iterations)
        .links(forceProperties.link.enabled ? graph.links : []); 
  
    simulation.force("netprod") 
        .strength(forceProperties.netprod.strength * forceProperties.netprod.enabled) 
        .orientation(forceProperties.netprod.orientation) 
        ; 
    simulation.force("grosscons") 
        .strength(forceProperties.grosscons.strength * forceProperties.grosscons.enabled) 
        .orientation(forceProperties.grosscons.orientation) 
        ; 
    simulation.force("grossprod") 
        .strength(forceProperties.grossprod.strength * forceProperties.grossprod.enabled) 
        .orientation(forceProperties.grossprod.orientation) 
        ; 
    simulation.force("supplydemand") 
        .strength(forceProperties.supplydemand.strength * forceProperties.supplydemand.enabled) 
        .orientation(forceProperties.supplydemand.orientation);

    // updates ignored until this is run
    // restarts the simulation (important if simulation has already slowed down)
    simulation.alpha(1).restart();
}

function exportForces() {
  // // http://www.4codev.com/javascript/download-save-json-content-to-local-file-in-javascript-idpx473668115863369846.html
  // function download(content, fileName, contentType) { 
  //   const a = document.createElement("a"); 
  //   const file = new Blob([content], { type: contentType }); 
  //   a.href = URL.createObjectURL(file); 
  //   a.download = fileName; 
  //   a.click(); 
  // } 
  // download(JSON.stringify(forceProperties), 'forceprop.json', 'test/plain')
  writeFile( JSON.stringify(forceProperties), 'forceprop.json' );
}

function importForces(fname='forceprop.json') {
  // https://stackoverflow.com/questions/3646914/how-do-i-check-if-file-exists-in-jquery-or-pure-javascript
  function executeIfFileExist(src, callback) {
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function() {
        if (this.readyState === this.DONE) {
            callback(xhr.response)
        }
    }
    xhr.open('HEAD', src)
  }
  // console.log(colorbrewer);

//  executeIfFileExist('forceprop.json',
//    function(data) {
//     condole.log('here');
//      console.log(data);
//    }
//  );
  
   // https://stackoverflow.com/questions/12460378/how-to-get-json-from-url-in-javascript
   var getJSON = function(url, callback) {
     var xhr = new XMLHttpRequest();
     xhr.open('GET', url, true);
     xhr.responseType = 'json';
     xhr.onload = function() {
       var status = xhr.status;
       if (status === 200) {
         callback(null, xhr.response);
       } else {
         callback(status, xhr.response);
       }
     };
     xhr.send(); 
   };


  getJSON(fname,
    function(err, data) {
      if (err !== null ) {
        console.log(err)
      } else {
        //forceProperties = data;
        // some nice method to merge two object
        // https://stackoverflow.com/questions/171251/how-can-i-merge-properties-of-two-javascript-objects-dynamically
        forceProperties = {...forceProperties, ...data}
        updateControls();
        updateForces();

      }
    }
    );
}

//////////// SERIES ////////////

var seriesProperties = {
  position : 0,
  series_length : 0,
  series_labels : [], 
  difference : {
    enabled : false,
    hidenodiff : false,
    position : 0
  },
  diffofdiff : {
    enabled : false,
    position_c: 0,
    position_d: 0
  }
}

function initializeSeries() {
  if (graph.graph.series_labels) {
    seriesProperties.series_labels = graph.graph.series_labels;
    if ('series_descs' in graph.graph ) {
      seriesProperties.series_descs = graph.graph.series_descs;
    } else {
      seriesProperties.series_descs = graph.graph.series_labels;
    }
    seriesProperties.series_length = graph.graph.series_labels.length;
    seriesProperties.position = 1; 
    seriesProperties.difference.position = 1; 
    seriesProperties.diffofdiff.position_c = 1; 
    seriesProperties.diffofdiff.position_d = 1; 
    get_flux = function(d) { return d.series_flux[seriesProperties.position-1]; }
    get_scl_flux = function(d) { return d.series_scl_flux[seriesProperties.position-1]; }
    get_process_flux = function(d, p) { return d.series_flux_byproc[seriesProperties.position-1][p]}
    get_flux_by_process = function(d) { return d.series_flux_byproc[seriesProperties.position-1]} 
    get_flux_by_process_atdiffpos = function(d) { return d.series_flux_byproc[seriesProperties.difference.position-1]} 
  } else  {
    seriesProperties.series_labels = [];
    seriesProperties.series_length = 0;
    seriesProperties.position = 0; 
    seriesProperties.difference.position = 0; 
    seriesProperties.diffofdiff.position_c = 0; 
    seriesProperties.diffofdiff.position_d = 0; 
    get_flux = function(d) { return d.flux; }
    get_scl_flux = function(d) { return d.scl_flux; }
    get_process_flux = function(d, p) { return d.flux_byproc[p]}
    get_flux_by_process = function(d) { return d.flux_byproc }
    get_flux_by_process_atdiffpos = get_flux_by_process ;  // reuse same function when there is no series
  }
  updateSeriesControls();
}

function updateSeriesControls() {
  d3.select('#series_PositionSliderOutput').text(seriesProperties.series_labels[seriesProperties.position-1]);
  document.getElementById("series_PositionSliderInput").min = 1;
  document.getElementById("series_PositionSliderInput").max = seriesProperties.series_length;
  document.getElementById("series_PositionSliderInput").value = seriesProperties.position;

  d3.select('#seriesdiff_PositionSliderOutput').text(seriesProperties.series_labels[seriesProperties.position-1]);
  document.getElementById("seriesdiff_PositionSliderInput").min = 1;
  document.getElementById("seriesdiff_PositionSliderInput").max = seriesProperties.series_length;
  document.getElementById("seriesdiff_PositionSliderInput").value = seriesProperties.position;

//  d3.select('#seriesdiffofdiffB_PositionSliderOutput').text(seriesProperties.series_labels[seriesProperties.position-1]);
//  document.getElementById("seriesdiffofdiffB_PositionSliderInput").min = 1;
//  document.getElementById("seriesdiffofdiffB_PositionSliderInput").max = seriesProperties.series_length;
//  document.getElementById("seriesdiffofdiffB_PositionSliderInput").value = seriesProperties.position;
  d3.select('#seriesdiffofdiffC_PositionSliderOutput').text(seriesProperties.series_labels[seriesProperties.position-1]);
  document.getElementById("seriesdiffofdiffC_PositionSliderInput").min = 1;
  document.getElementById("seriesdiffofdiffC_PositionSliderInput").max = seriesProperties.series_length;
  document.getElementById("seriesdiffofdiffC_PositionSliderInput").value = seriesProperties.position;
  d3.select('#seriesdiffofdiffD_PositionSliderOutput').text(seriesProperties.series_labels[seriesProperties.position-1]);
  document.getElementById("seriesdiffofdiffD_PositionSliderInput").min = 1;
  document.getElementById("seriesdiffofdiffD_PositionSliderInput").max = seriesProperties.series_length;
  document.getElementById("seriesdiffofdiffD_PositionSliderInput").value = seriesProperties.position;
}

function updateSeries() {
  updateDisplay();
  
}

//////////// DISPLAY ////////////

let displayProperties = {

  // html
  controls : {
    forcepanel : { enabled : false, },
    label : { enabled : true, },
    barplot : { enabled : true, },
    diff : { enabled : true, },
    diffofdiff : {enabled : false},
    title : { enabled : true, },
  },

  // svg
  label : {
    enabled : true,
    filter_level : 60,
    use_criptic_name: false,
    minimum_label_size: 2,
    pos_above_node: true
  },

  colorscale: {
    range : 5,
    max : undefined,
  },

  sticky : {
    visible : false
  },

  bar : {
    visible : true,
    active : 0,
    plots : [],
  },

  title: {
    enabled : false,
    text: '',
  },
};


          
function toggleForcepanel() {
  displayProperties.controls.forcepanel.enabled = document.getElementById('forcepanel_Enabled').checked;
  //if (document.getElementById('forcepanel_Enabled').checked) {
  if ( displayProperties.controls.forcepanel.enabled ) {
    document.getElementById('forcepanel').style.display = "block";

  } else {
    document.getElementById('forcepanel').style.display = "none";
  }
}

function toggleDiffcontrols(cb) {

  let my_diff_enabled = cb.checked;

  if (my_diff_enabled ) {
    // expand the control panel
    document.getElementById('diffcontrols').style.display = "block";
  } else {
    // hide the control panel
    document.getElementById('diffcontrols').style.display = "none";
  }

  if (cb.id == 'difference_Enabled') {

    displayProperties.controls.diff.enabled = my_diff_enabled;
    seriesProperties.difference.enabled = my_diff_enabled;

    if (my_diff_enabled) {
      // text should read "reference case"
      let my_label = document.getElementById('label_ReferenceCase')
      let my_text = my_label.firstChild;
      my_text.data = 'reference case is ';

      // hide the extra sliders for diff of diff
      document.getElementById('diffofdiffcontrols').style.display = "none";

      // turn off diffofdiff
      document.getElementById('diffofdiff_Enabled').checked = false;
      displayProperties.controls.diffofdiff.enabled = false;
      seriesProperties.diffofdiff.enabled = false;

    } 
  } else if ( cb.id == 'diffofdiff_Enabled') {

    displayProperties.controls.diffofdiff.enabled = my_diff_enabled;
    seriesProperties.diffofdiff.enabled = my_diff_enabled;

    if (my_diff_enabled ) {
      // text should read "case B"
      let my_label = document.getElementById('label_ReferenceCase')
      let my_text = my_label.firstChild;
      my_text.data = 'case B is ';

      // show the extra sliders for diff of diff
      document.getElementById('diffofdiffcontrols').style.display = "block";

      // turn off diff
      document.getElementById('difference_Enabled').checked = false;
      displayProperties.controls.diff.enabled = false;
      seriesProperties.difference.enabled = false;

    } 

  }

}

function toggleTitlecontrols() {
  displayProperties.controls.title.enabled = document.getElementById('title_Enabled').checked;
  displayProperties.title.enabled = document.getElementById('title_Enabled').checked;
  if (displayProperties.controls.title.enabled ) {
    document.getElementById('titlecontrols').style.display = "block";
  } else {
    document.getElementById('titlecontrols').style.display = "none";
  }
}

function toggleLabelcontrols() {
  displayProperties.controls.label.enabled = document.getElementById('label_Enabled').checked;
  displayProperties.label.enabled = document.getElementById('label_Enabled').checked;
  if (displayProperties.controls.label.enabled ) {
    document.getElementById('labelcontrols').style.display = "block";
  } else {
    document.getElementById('labelcontrols').style.display = "none";
  }
}

function toggleBarplotcontrols() {
  displayProperties.controls.barplot.enabled = document.getElementById('barplot_Enabled').checked;
  displayProperties.bar.visible = document.getElementById('barplot_Enabled').checked;
  if (displayProperties.controls.barplot.enabled ) {
    document.getElementById('barplotcontrols').style.display = "block";
  } else {
    document.getElementById('barplotcontrols').style.display = "none";
  }
  showHideBarplot();
}

function toggleLoadStatuscontrols(cb) {
  if (cb.id == 'nodeposFixedOnly_Enabled') { 
    d3.select('#nodeposAllNodes_Enabled').property('checked', ! cb.checked); 
    loadOptions.nodepos.fixed_only = cb.checked;
    loadOptions.nodepos.all_nodes = ! cb.checked;
  } else if (cb.id == 'nodeposAllNodes_Enabled') { 
    d3.select('#nodeposFixedOnly_Enabled').property('checked', ! cb.checked); 
    loadOptions.nodepos.all_nodes = cb.checked;
    loadOptions.nodepos.fixed_only = ! cb.checked;
  } else if (cb.id == "dropNodes_Enabled") {
    loadOptions.dropped_nodes = cb.checked;
  } else if (cb.id == "importDisplayProperties_Enabled") {
    loadOptions.display_props = cb.checked;
  } else if (cb.id == "importForces_Enabled") {
    loadOptions.force = cb.checked;
  }
}

// generate the svg objects and force simulation
function initializeDisplay() {

  // define arrow head!
  //
  // basic version
  svg.append("defs").selectAll("marker")
  .data(["end"])
  .enter().append('svg:marker')
  .attr("id", String)
  .attr("viewBox", "0 0 40 20")
  .attr("refX", "35")
  .attr("refY", "15")
  .attr("markerWidth", "3")
  .attr("markerHeight", "6")
  .attr("orient", "auto")
  .append("svg:path")
  .attr("d", 'M0,0 V30 L50,15 Z')
  ;
  // version meant for visible_zeroflux 
  svg.append("defs").selectAll("marker")
  .data(["end_small_fixed"])
  .enter().append('svg:marker')
  .attr("id", String)
  .attr("viewBox", "0 0 40 20")
  .attr("refX", "35")
  .attr("refY", "15")
  .attr("markerUnits", "userSpaceOnUse")
  .attr("markerWidth", "6")
  .attr("markerHeight", "12")
  .attr("orient", "auto")
  .append("svg:path")
  .attr("d", 'M0,0 V30 L50,15 Z')
  ;
  // for revesed edge
  svg.append("defs").selectAll("marker")
  .data(["start"])
  .enter().append('svg:marker')
  .attr("id", String)
  .attr("viewBox", "0 0 40 20")
  .attr("refX", "35")
  .attr("refY", "15")
  .attr("markerWidth", "3")
  .attr("markerHeight", "6")
  .attr("orient", "auto-start-reverse")
  .append("svg:path")
  .attr("d", 'M0,0 V30 L50,15 Z')
  ;
  svg.append("defs").selectAll("marker")
  //.data(["start_small_fixed"])
  .data(["start_small_fixed"])
  .enter().append('svg:marker')
  .attr("id", String)
  .attr("viewBox", "0 0 40 20")
  .attr("refX", "35")
  .attr("refY", "15")
  .attr("markerUnits", "userSpaceOnUse")
  .attr("markerWidth", "6")
  .attr("markerHeight", "12")
  .attr("orient", "auto-start-reverse")
  .append("svg:path")
  .attr("d", 'M0,0 V30 L50,15 Z')
  ;



  // clear first
  canvas.selectAll(".links").remove();
  canvas.selectAll(".hl_links").remove();
  canvas.selectAll(".nodes").remove();
  canvas.selectAll(".labels").remove();

  link = canvas.append("g")
        .attr("class", "links")
    .selectAll("line")
    .data(graph.links)
    .enter().append("line")
    .on("click", linkclicked);

  hl_link = canvas.append("g")
        .attr("class", "hl_links")
    .selectAll("line")
        .data(graph.links)
    .enter().append("line")
    .attr("stroke", hl_color)
    .attr("opacity", 0)
  ;
            
   
  // set the data and properties of node circles
  node = canvas.append("g") 
    .attr("class", "nodes") 
    .selectAll("circle")
    .data(graph.nodes)
    .enter().append("circle") 
    .style('visibility','visible')
    .on('mousedown', mousedown)
//    .on('mouseup', mouseup)
    .on('click', nodeclicked)
    .call(d3.drag() 
      .on("start", dragstarted) 
      .on("drag", dragged) 
      .on("end", dragended)
    ) ;

  function mousedown(event, d) {
//    console.log('mousedown', d);
    if (event.shiftKey) {
      d3.select(this).call(d3.drag()
        .on('start', null)
        .on('drag', null)
        .on('end', null)
      )};
  }


  
  // link tooltip
  // turned out that (1) code start with node id string for link.source and link.target.  And when simulation starts, 
  // (i think when "link" force is defined), this source/target is changed to the node object for each.
  // I could have switch from string to object by myself somewhere up front, make sure that i always see node object, 
  // so that i can consistently use link.source.desc and link.target.desc.   But i afraid i may break somewhere else.
  // compromis here is to trie to use link.source.desc and link.target.desc to come up with link tooltip, but prepare
  // to fall back to the case when link.source and link.target is string for node id
  link.append("title")
      .text(function(d) { return ( 
        (d.source.desc === undefined ? (d.source.id === undefined ? d.source : d.source.id) : d.source.desc) 
        + ' \u21d2 ' + 
        (d.target.desc === undefined ? (d.target.id === undefined ? d.target : d.target.id ) : d.target.desc)
      ); });

  // node tooltip
  node.append("title")
      .text(function(d) { return d.id; });

  node.attr("id", function(d) { return 'n_' + d.id; });

  // node label
  label = canvas.append("g")
  .attr("class", "labels")
  .selectAll("text")
  .data(graph.nodes)  
  .enter().append("text")
  .text(function(d) { return d.id;})
  .style("text-anchor", "middle")
  .style("font-weight", 'bold')
  .style("fill", "black")
  .style("stroke", "white")
  .style("stroke-width", .3)
  ;

  
    
  // title
  if ('title' in graph.graph) {
    displayProperties.title.enabled = true;

    if (title === undefined ) {
    title = svg.append("g")
      .attr("class", "title")
      .attr("transform", "translate(6,20)")
      .selectAll("text")
      .data([graph.graph])
      .enter().append("text")
       .text(function(d) { return d.title; })
     ;
    }
  }

  node 
    .attr("stroke", function(d) { if ('demand' in d) { return 'limegreen'; } else if ('supply' in d) { return 'red'; } else if ('unconstrained_raw' in d) {return '#FFBF00';} else {return 'white'; } } ) 
    .attr("stroke-width", 2)
    ;
  link 
    .attr("opacity", 1)
    ;

  initializeScales();

  initializeLegend();
  updateLegend();

  // visualize the graph
  updateDisplay();
  updateControls();
  //initializeSimulation();  let's do this explicitly when nodes got loaded
}

function initializeLegend() {
  var d = [{x:20, y:(height-250)}];
  legend 
    .attr("transform", "translate(20,"+ (height-250) + ")")
    .data(d)
    .call(d3.drag() 
      .on("drag", legenddragged)); 
}

function updateLegend() {

  const diff_enabled = seriesProperties.series_length > 0 && 
    ( seriesProperties.difference.enabled || 
      seriesProperties.diffofdiff.enabled ) ;


  // clear first
  legend.selectAll('*').remove();

  // node size
  legend
    .append("g")
    .attr("class", "legendSize")
    .attr("id", "legend_nodesize")
    .attr("transform", "translate(0, 0)"); 
  
  var legendSize = d3.legendSize()
    .scale(nodesizeScale)
    .cells([10,1000,  1000000])
    .shape('circle')
    //.shapePadding(30)
    .shapePadding(30)
    .labelOffset(20)
    .labelFormat(",")
    .orient('horizontal')
    .title('Throughput (kton/yr)'); 
  legend
    .select("#legend_nodesize")
    .call(legendSize); 

  // get the size being generated
  let w = legend.node().getBBox().width;
  let h = legend.node().getBBox().height;

  // edge width 
  legend.append("g") 
    .attr("id", "legend_edgewidth") 
    .attr("transform", "translate(0, " + (h + 20 ) + ")");  // have 20 px padding
  
  let lvls = [10, 100, 1000, 10000, 100000];
  if (diff_enabled) {
    lvls = [0, 10, 100, 1000, 10000, 100000];
  }
  var legendSizeLine = d3.legendSize() 
    .scale(edgewidthScale) 
    //.cells([10, 1000,  1000000]) 
    //.cells([10, 100, 1000, 10000, 1000000]) 
    .cells(lvls)
    .shape("line") 
    .shapeWidth(100) 
    .labelFormat(",")
    .title("Net flux (kton/yr)"); 
  legend.select("#legend_edgewidth") 
    .call(legendSizeLine); 

  // hack: somehow when "line" is used for shape, color never got set 
  // so i am doing that afterwards here 
  legend
    .select("#legend_edgewidth")
    .selectAll("line")
    .style("stroke", "#aaa")
  // plus, showing arrow head
    .attr("marker-end", "url(#end)")
  ;

  if (diff_enabled) {
    // replace the visible_zeroflux
    legend
      .select("#legend_edgewidth")
      .select("line") // first one
      .style("width", visible_zeroflux_width)
      .style("marker-end", "url(#end_small_fixed)")
      .style("stroke-dasharray", "5 5")
    ;

  }



  // when diff or diffofdiff is shown
  if (diff_enabled ) {

    // get the size being generated
    let w = legend.node().getBBox().width;
    let h = legend.node().getBBox().height;

    // edge color
    legend 
      .append("g") 
      .attr("id", "legend_edgecolor") 
      .attr("transform", "translate(" +( w + 20 ) +  " , 0)"); 
    
    let fmt = d3.format(',');
    var legendColor = d3.legendColor()
      .labelFormat(",")
      //.labelFormat(d3.format(".2f"))
      //.labels(d3.legendHelpers.thresholdLabels)
      //.useClass(true)
      .scale(edgecolorScale)
      .title("Change (kton/yr)")
      .ascending(true)
      .labels(function(x) {
        if (x.i == 0) { 
          return 'less than '+fmt(x.domain[0]);
        } else if (x.i==(x.genLength-1)) {
          return 'greater than '+fmt(x.domain.at(-1));
        } else { 
          return x.generatedLabels[x.i]
        }})
    ;
  
    legend.select("#legend_edgecolor")
    .call(legendColor);
  }

  // another hack...
  // when exported to SVG, label overlap when there are too many digit
  // below shrink the font across the board
  legend.selectAll(".label").style('font-size', '11px');
  legend.selectAll(".legendTitle").style('font-size', '12px').style('font-weight', 'bold');
}

function updateVisibility() {


//  for (var i=0, link; i < graph.links.length; ++i) {
//    link = graph.links[i]; 
//    if ( seriesProperties.difference.hidenodiff) {
//      link.link_visible = link.link_visibility_elements.has_diff;
//    } else {
//      link.link_visible = true;
//    }
//  }
//
//  for (var i=0, node; i < graph.nodes.length; ++i) {
//    node = graph.nodes[i]; 
//    if ( seriesProperties.difference.hidenodiff) {
//      node.node_visible = node.node_visibility_elements.has_diff;
//    } else {
//      node.node_visible = true;
//    }
//
//
//    for (var j=0, edge, link; j < node.edge_list.length; ++j) {
//      edge = node.edge_list[j];
//      link = graph.links.filter( function(d) {return d.id == edge} );
//      if (link.length != 1) debugger;
//      link = link[0];
//      if (link.link_visible ) { node.node_visible = true; };
//    }
//
//  }

  function check_edgelist(node) {
    for (var j=0, edge, link; j < node.edge_list.length; ++j) {
      edge = node.edge_list[j];
      //link = graph.links.filter( function(d) {return d.id == edge} );
      link = graph.links.filter( x => x.id == edge );
      if (link.length != 1) debugger;
      link = link[0];
      if (link.link_visible ) { node.node_visible = true; };
    }
  }

  // node/edge visibility (when showing only diff)
  if ( seriesProperties.difference.hidenodiff) {
    if (seriesProperties.difference.enabled) {
      graph.links.map(x => x.link_visible = x.link_visibility_elements.has_diff);
      graph.nodes.map(x => x.node_visible = x.node_visibility_elements.has_diff);
      graph.nodes.map(check_edgelist);
    } else if (seriesProperties.diffofdiff.enabled) {
      graph.links.map(x => x.link_visible = x.link_visibility_elements.has_diffofdiff);
      graph.nodes.map(x => x.node_visible = x.node_visibility_elements.has_diffofdiff);
      graph.nodes.map(check_edgelist);
    } else {
      graph.links.map(x => x.link_visible = true);
      graph.nodes.map(x => x.node_visible = true);
    }
  } else {
    graph.links.map(x => x.link_visible = true);
    graph.nodes.map(x => x.node_visible = true);
  }

//  for (var i=0, node; i < graph.nodes.length; ++i) {
//    node = graph.nodes[i]; 
//    if ( displayProperties.label.enabled ) { 
//      if (node.node_visible) { 
//        if ( get_scl_flux(node) * 100 > displayProperties.label.filter_level) {
//          node.label_visible = true;
//        } else {
//          node.label_visible = false;
//        } 
//      } else { 
//        node.label_visible = false; 
//      } 
//    } else { 
//      node.label_visible = false; 
//    } 
//  }
 
  // label visibility
  if (displayProperties.label.enabled) {
    graph.nodes.map(x => x.label_visible = (
      x.has_visible_zeroflux ||
      (
        x.node_visible && 
        (get_scl_flux(x) * 100 > displayProperties.label.filter_level) 
      )
    ));
  } else {
    graph.nodes.map(x => x.label_visible = false);
  }

}

function initializeScales() {
  // breaks on log10 scale
  var div = {
    1: [10],
    2: [10, 30],
    3: [10, 20, 50],
    4: [10, 20, 30, 55],
    5: [10, 15, 25, 40, 65],
    6: [10, 15, 20, 30, 50, 70],
    7: [10, 15, 20, 25, 35, 50, 70],
    8: [10, 14, 20, 25, 30, 40, 55, 75],
    9: [10, 13, 17, 22, 30, 35, 45, 60, 80],
   10: [10, 13, 15, 20, 25, 30, 40, 50, 65, 80],
  };

  // node flux
  //var scl = graph.graph.scale;
  //var ub = 10 ** (Math.round(Math.log10(scl)) - 1);
  var ub = flux_scale;
  nodesizeScale = d3.scaleLog()
     .domain([ub * 1e-5, ub])
     .range([2, 18]);


  // link flux
  edgewidthScale = d3.scaleLog()
      .domain([ub * 1e-5, ub])
      .range([0, 8]);


  if ( seriesProperties.series_length > 0 ) { mkcolorscale() }

}

function mkcolorscale() {

  function brewcolors(n, pal) {
    // stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
    function componentToHex(c) {
      var hex = c.toString(16);
      return hex.length == 1 ? "0" + hex : hex;
    }
    
    function rgbToHex(r, g, b) {
      return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }
    
    function srgbToHex(srgb) {
      srgb = srgb.map( function(x) { return Math.floor(x*255)});
      return rgbToHex(srgb[0], srgb[1], srgb[2]);
    }
//    console.log('bc2');
    let n1 = pal.length;
    let n2 = n;
    let cols1 = pal.map(function (x) {return new Color(x)});
    let v1 = [...Array(n1).keys()].map(function (x) {return x / (n1-1)});
    let v2 = [...Array(n2).keys()].map(function (x) {return x / (n2-1)});
    let cols2 = [], rng;
    for (let i=0, j=0, j0=0; i < (n1 - 1); ++i) {
      j0 = j;
      while (v2[j] <= v1[i+1]) {++j};
      rng = cols1[i].range( cols1[i+1], 
        {space:'lab', outputSpace:'srgb'} );
      for (let jj=j0; jj<j; ++jj) {
        p = (v2[jj] - v1[i])/(v1[i+1] - v1[i]);
 //       console.log(i, i+1, j0, j, jj, v1[i], v1[i+1], v2[j0], v2[j], v2[jj], p);
        cols2.push(rng(p));
      }
    }
 //   console.log(cols2.length);
    let pal2 = cols2.map(function(d) {return srgbToHex(d.srgb)})
    return pal2
  }


  var pal0 = colorbrewer.RdBu['11'].slice() //.reverse();
  pal0[5] = '#ccc';  // too faint

  let pow = 1;
  if (displayProperties.colorscale.max === undefined) {
    pow = Math.round(Math.log10(diff_scale)) -1 ;
    displayProperties.colorscale.max = pow;
  } else {
    pow = displayProperties.colorscale.max;
  }
  let scale = 10 ** pow;

  let n = displayProperties.colorscale.range;

  thres = d3.range(n).map(function (x) { return scale*10**(-x)}).reverse();
  thres = [...thres.map(function(x) {return -x}).reverse(), ...thres];

  let pal = brewcolors(2*n+1, pal0)

  edgecolorScale = d3.scaleThreshold()
    .domain(thres)
    .range(pal);

  edgezlevelScale =  d3.scaleThreshold()
    .domain(thres)
    .range( d3.range(-n, n+1) );
   
}

function updateLinkColor() {

  if (seriesProperties.series_length == 0 ) { return ; }

  // if (! seriesProperties.difference.enabled) {
  //   for (var i=0, link; i < graph.links.length; ++i) {
  //     link = graph.links[i]; 
  //     link.color = edgecolorScale(0);
  //     link.paintorder = 0; 
  //   }
  //   return;
  // }

  // for (var i=0, link, v, idx; i < graph.links.length; ++i) {
  //   link = graph.links[i]; 

  //   link.color = edgecolorScale(link.diff);
  //   link.paintorder = edgezlevelScale(link.diff);

  // }

  if (seriesProperties.difference.enabled) {
//    graph.links.map( 
//      function (x) { x.color = edgecolorScale(x.diff); x.paintorder = edgezlevelScale(Math.abs(x.diff)); }
//    );
     for (var i=0, link, v, idx; i < graph.links.length; ++i) {
       link = graph.links[i]; 

       link.color = edgecolorScale(link.diff);
       link.paintorder = edgezlevelScale(Math.abs(link.diff));

     }
  } else if (seriesProperties.diffofdiff.enabled) {
    graph.links.map( 
      function (x) { x.color = edgecolorScale(x.diffofdiff); x.paintorder = edgezlevelScale(Math.abs(x.diffofdiff)); }
    );
  } else {
    graph.links.map( 
      function (x) { x.color = edgecolorScale(0); x.paintorder = 0; }
    );
  }
}

function updateSize() {
  graph.nodes.map(d => d.has_visible_zeroflux = false);

  var lb = edgewidthScale.domain()[0]
  for (var i=0, link, flux; i < graph.links.length; ++i) {
    link = graph.links[i]; 
    flux = get_flux(link);
    // suppoert negative flux!!
    link.link_width = Math.abs(flux) < lb ? 0 : edgewidthScale( Math.abs(flux) );
    link.reversed = flux < 0;
    // special treatment
    // when there is difference, paintorder is set to be > 0, by updateLinkColor()
    // in such case, make link with to be thin but visible
    if (link.paintorder > 0 && link.link_width < visible_zeroflux_width) {
      link.link_width = visible_zeroflux_width;
      link.visible_zeroflux = true;
      link.source.has_visible_zeroflux = true;
      link.target.has_visible_zeroflux = true;
    } else {
      link.visible_zeroflux = false;
    }
  }

  lb = nodesizeScale.domain()[0]
  for (var i=0, node, flux; i < graph.nodes.length; ++i) {
    node = graph.nodes[i]; 
    flux = get_flux(node);
    node.node_size = flux < lb ? 0 : nodesizeScale( flux);
    if (node.node_size == 0 && node.has_visible_zeroflux) {
      node.node_size = visible_zeroflux_size;
      //debugger;
    }
    node.label_size = Math.max(node.node_size , displayProperties.label.minimum_label_size);
    //if (node.node_size == 0 && node.has_visible_zeroflux) {
    //  node.label_size = Math.max(node.label_size, displayProperties.label.minimum_label_size);
    //}
  }
}

function updateLabel() {

  if (displayProperties.label.use_cryptic_name) {
    label.text(function(d) { return d.id;})
  } else {
    label.text(function(d) { return d.desc;})
  }
}

function updateTitle() {
  if (title === undefined) { return }
  if (! displayProperties.title.enabled) { 
    title.text('');
    return; 
  }
  if ( seriesProperties.series_length == 0 ) {
    title.text( function(d) {return d.title} );
  } else {
    if (graph.graph.composite) {
      if (seriesProperties.difference.enabled) { 
        title.text( d => '[ ' + d.series_descs[d.series_position-1] + ' ]'
          + ' - [ ' + d.series_descs[d.series_difference_position-1] + ' ]'
        )
      } else if ( seriesProperties.diffofdiff.enabled ) {
        title.text( d => '[ [ ' + d.series_descs[d.series_position-1] + ' ]'
          + ' - [ ' + d.series_descs[d.series_difference_position-1] + ' ] ]'
          + ' - [ [ ' + d.series_descs[d.series_diffofdiff_position_c-1] + ' ]'
          + ' - [ ' + d.series_descs[d.series_diffofdiff_position_d-1] + ' ] ]'
        )
      } else {
        title.text( d => d.series_descs[d.series_position-1] );
      }

    } else {
      if (seriesProperties.difference.enabled) { 
        title.text(function(d) { return d.title 
            + ' ( showing ' + d.series_descs[d.series_position-1] +  ' ; ' 
            + 'reference ' + d.series_descs[d.series_difference_position-1] + ' )' 
        });
      } else if ( seriesProperties.diffofdiff.enabled ) {
        title.text(function(d) { return d.title 
            + ' ( showing [ [' + d.series_descs[d.series_position-1] +  '] - ' 
            + '[ ' + d.series_descs[d.series_difference_position-1] + '] ] - ' 
            + '[ [ ' + d.series_descs[d.series_diffofdiff_position_c-1] + '] - ' 
            + '[ ' + d.series_descs[d.series_diffofdiff_position_d-1] + '] ] )' 
        });
      } else {
        title.text(function(d) { return d.title 
            +  ' ( ' + d.series_descs[d.series_position-1]  + ' )' 
        });
      }
    }

  } 

    

}

// update the display based on the forces (but not positions)
function updateDisplay() {

  var scl;

  //if (seriesProperties.difference.enabled) {detectDifference() };

  if ( seriesProperties.series_length > 0) {
    detectDifference();
//    function get_scl_flux(d) { return d.series_scl_flux[seriesProperties.position-1]; }
//    function get_flux(d) { return d.series_flux[seriesProperties.position-1]; }

    graph.graph.series_position = seriesProperties.position
    graph.graph.series_difference_position = seriesProperties.difference.position
    graph.graph.series_diffofdiff_position_c = seriesProperties.diffofdiff.position_c;
    graph.graph.series_diffofdiff_position_d = seriesProperties.diffofdiff.position_d;

  } else {
//    function get_scl_flux(d) { return d.scl_flux; }
//    function get_flux(d) { return d.flux; }
  }

  updateLabel();
  //updateVisibility();
  mkcolorscale();
  updateLinkColor();
  // node color
  updateSize();
  updateVisibility();
  updateTitle();
  updateLegend();


  node 
    .style("fill", function(d) {return displayProperties.sticky.visible && d.fx ? 'beige' : 'black'})
    .style("visibility", function(d) {return d.node_visible ? "visible" : "hidden"; } )
    .attr("r", function(d) {return d.node_size;})

  function pick_arrowhead(d) {
    if (d.visible_zeroflux) {
      if (d.reversed) {
        return 
      } else {
      }
    } else {
      if (d.reversed) {
      } else {
      }
    }
  }



  // https://stackoverflow.com/a/13794019/1013786 get this idea, i need to sort by color
  // https://stackoverflow.com/a/55618453/1013786
  link 
    .style("visibility", function(d) {return d.link_visible ? "visible" : "hidden"; } )
    .attr("stroke-width",function(d) {return d.link_width})
    .style("marker-end",   function(d) {return d.reversed ? "none" : ( d.visible_zeroflux ? 'url(#end_small_fixed)' : 'url(#end)' ); })
    .style("marker-start", function(d) {return d.reversed ? ( d.visible_zeroflux ? 'url(#start_small_fixed)' : 'url(#start)' ): "none"; })
    .style("stroke", function(d) {return d.color;} )
    .style("stroke-dasharray", function(d) {return d.visible_zeroflux ? "5 5" : "none"})
    .sort( function (a, b) { return a.paintorder - b.paintorder })
    .order();


  label
    .style("visibility", function(d) {return d.label_visible ? "visible" : "hidden"; } )
    .style("font-size", function(d) {return d.label_size;});
  ;

  // update barplot
  updateAllBarplot();


      

}

function isclose(a, b) {
  var atol = 1e-8;
  var rtol = 1e-5;
  if (b==0) {
    return a==0 ? true : false;
  } else {
    return Math.abs(a - b) <= atol + rtol * Math.abs(b);
  }
}

function detectDifference() {
  // hide nodes/edges whose flux is not changing between two cases

  var nodes = graph.nodes,
    links = graph.links, 
    n , i, node, link;
  // forr debugging
  var n1=0,n2=0,n3=0,n4=0;


  bc = seriesProperties.difference.position - 1
  tc = seriesProperties.position - 1

  bc2 = seriesProperties.diffofdiff.position_d -1
  tc2 = seriesProperties.diffofdiff.position_c -1

  n = nodes.length;
  for (i=0; i < n; ++i) {
    node = nodes[i];
    //if (node.series_scl_flux[tc] == node.series_scl_flux[bc])  {
    if (isclose(node.series_scl_flux[tc], node.series_scl_flux[bc]))  {
      node.node_visibility_elements.has_diff = false;
      node.diff = node.series_scl_flux[tc] - node.series_scl_flux[bc];
      ++n1;
    } else {
      node.node_visibility_elements.has_diff = true;
      node.diff = 0;
      ++n2;
    }

    if (isclose(
      (node.series_scl_flux[tc]-node.series_scl_flux[bc]),
      (node.series_scl_flux[tc2]-node.series_scl_flux[bc2])
    )) {
      node.node_visibility_elements.has_diffofdiff = false;
      node.diffofdiff = (node.series_scl_flux[tc] - node.series_scl_flux[bc]) 
        - (node.series_scl_flux[tc2] - node.series_scl_flux[bc2]) ;
    } else {
      node.node_visibility_elements.has_diffofdiff = true;
      node.diffofdiff = 0;
    }

  }
  // console.log(n1, n2);

  n = links.length
  for (i=0; i < n; ++i) {
        link  = links[i];
//    if (link.id == 'ACETICACID:ETHANOL') {
//      console.log(link);
//    }

    //if (link.series_scl_flux[tc] == link.series_scl_flux[bc]) {
    if (isclose(link.series_flux[tc] , link.series_flux[bc])) {
      link.link_visibility_elements.has_diff = false;
      link.diff = link.series_flux[tc] - link.series_flux[bc];
      ++n3;
    } else {
      link.link_visibility_elements.has_diff = true;
      link.diff = link.series_flux[tc] - link.series_flux[bc];
      ++n4;
    }

    if (isclose(
      (link.series_flux[tc]-link.series_flux[bc]),
      (link.series_flux[tc2]-link.series_flux[bc2])
    )) {
      link.link_visibility_elements.has_diffofdiff = false;
      link.diffofdiff = (link.series_flux[tc] - link.series_flux[bc]) 
        - (link.series_flux[tc2] - link.series_flux[bc2]) ;
    } else {
      link.link_visibility_elements.has_diffofdiff = true;
      link.diffofdiff = (link.series_flux[tc] - link.series_flux[bc]) 
        - (link.series_flux[tc2] - link.series_flux[bc2]) ;
    }

  }
  // console.log(n3, n4);

}

function getTargetNodeCircumferencePoint(d) { 
  //var t_radius = d.target.node_size * .8; // nodeWidth is just a custom attribute I calculate during the creation of the nodes depending on the node width 
  //var t_radius = d.target.node_size * 1.2; // i need it bigger
  var t_radius = d.target.node_size + 2; // maybe it is the marker stoke size?
  //  console.log(d.target.node_size); 
  var dx = d.target.x - d.source.x; 
  var dy = d.target.y - d.source.y; 
  var gamma = Math.atan2(dy,dx); // Math.atan2 returns the angle in the correct quadrant as opposed to Math.atan 
  var tx = d.target.x - (Math.cos(gamma) * t_radius); 
  var ty = d.target.y - (Math.sin(gamma) * t_radius); 
  
  return [tx,ty]; 
}

function getSourceNodeCircumferencePoint(d) { 
  var s_radius = d.source.node_size * .8;
  //  console.log(d.target.node_size); 
  var dx = d.source.x - d.target.x; 
  var dy = d.source.y - d.target.y; 
  var gamma = Math.atan2(dy,dx); // Math.atan2 returns the angle in the correct quadrant as opposed to Math.atan 
  var sx = d.source.x - (Math.cos(gamma) * s_radius); 
  var sy = d.source.y - (Math.sin(gamma) * s_radius); 
  
  return [sx,sy]; 
}

// update the display positions after each simulation tick
function ticked() { 
  link 
    //.attr("x1", function(d) { return d.source.x; }) 
    //.attr("y1", function(d) { return d.source.y; }) 
    .attr("x1", function(d) { return getSourceNodeCircumferencePoint(d)[0]; })
    .attr("y1", function(d) { return getSourceNodeCircumferencePoint(d)[1]; })
    //.attr("x2", function(d) { return d.target.x; }) 
    //.attr("y2", function(d) { return d.target.y; }) 
    .attr("x2", function(d) { return getTargetNodeCircumferencePoint(d)[0]; }) 
    .attr("y2", function(d) { return getTargetNodeCircumferencePoint(d)[1]; }) 
  ;

    hl_link
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        //.attr("x2", function(d) { return d.target.x; })
        //.attr("y2", function(d) { return d.target.y; })
        .attr("x2", function(d) { return getTargetNodeCircumferencePoint(d)[0]; })
        .attr("y2", function(d) { return getTargetNodeCircumferencePoint(d)[1]; })
        ;

    node
        .attr("cx", function(d) { return d.x; })
        .attr("cy", function(d) { return d.y; });
    label
        .attr("x", function(d) { return d.x; })
        .attr("y", function(d) { return d.y + (displayProperties.label.pos_above_node ? d.node_size *(-1) : 0) ; }); // idont know why -1...? shouldn't it be +0.5? but it works with this way

 
  //node.attr("transform", d => `translate(${d.x},${d.y})`);

    d3.select('#alpha_value').style('flex-basis', (simulation.alpha()*100) + '%');
}

function exportStatus() {

  // node positions
  var nodepos = {};
  graph.nodes.forEach(function(e, i) { nodepos[e.id] = 
      ['id', 'x','y', 'fx','fy'].reduce(
        function(a,k) {
          if (e[k] === null ) console.log('null!', k, e[k], e)
          if (k in e) a[k] = e[k]; 
          //if (k in e) a[k] = e[k].toFixed ? Number(e[k].toFixed(2)) : e[k]; 
          return a} , 
        {})
  })

  // dropped nodes
  let dropped_nodes = graph.graph.dropped_nodes.map(function(x) { return x.id });


  out = {'force_properties': forceProperties, 'node_positions': nodepos, 'dropped_nodes': dropped_nodes, 'display_properties': displayProperties, };

  writeFile( JSON.stringify(out), 'status.json' );


//    writeFile( JSON.stringify(nodepos, function(k,v) { return v.toFixed ? Number(v.toFixed(2)) : v ;} ), 'nodepos.json' );
}

async function importStatus() { // nodepos_fx=true, nodepos_all=false, dropnodes=true, force=false, display=false, ) {
  console.log('importStatus');
  // https://stackoverflow.com/questions/3582671/how-to-open-a-local-disk-file-with-javascript
  let saved_status = await readFile();

  let nodepos_fx = loadOptions.nodepos.fixed_only;
  let nodepos_all = loadOptions.nodepos.all_nodes;
  let dropnodes = loadOptions.dropped_nodes;
  let display = loadOptions.display_props;
  let force = loadOptions.force;


  let forceprop = saved_status['force_properties'];
  let dropped_nodes = saved_status['dropped_nodes'];
  let nodepos = saved_status['node_positions'];
  let dispprop = saved_status['display_properties'];

  // support old format (nodepos.json)
  if (forceprop === undefined && nodepos === undefined) {
    delete saved_status['dropped_nodes']
    if (nodepos_fx || nodepos_all) {
      nodepos = saved_status; 
    }
  }

  // drop nodes
  if (dropnodes && dropped_nodes !== undefined ) {
    let nd = graph.nodes.filter(function(n) { return dropped_nodes.includes(n.id);}  );
    drop_nodes(nd);
  }

  // node position
  if ((nodepos_fx || nodepos_all) && nodepos !== undefined ) {
    for (let i = 0, nd, np; i < graph.nodes.length; ++i ) { 
      nd = graph.nodes[i];
      np = nodepos[nd.id];
      if (np === undefined ) {
        // node not in the graph
      } else {
        if (nodepos_fx) {
          if (np.fx !== undefined ) {
  //             console.log(nd);
  //          nd.x = nodepos[nd.id].fx;
  //          nd.y = nodepos[nd.id].fy;
            nd.fx = nodepos[nd.id].fx;
            nd.fy = nodepos[nd.id].fy;
          }
        } else {
               console.log('not fxonly')
          nd.x = nodepos[nd.id].x;
          nd.y = nodepos[nd.id].y;
          nd.fx = nodepos[nd.id].x;
          nd.fy = nodepos[nd.id].y;
        }
      }
    }
    
    // make behavior of cursor to be more appropriate when a lot got stuck
    if (! nodepos_fx) {
      setVerySticky(true);
    }
  }
  // display properties
  if ( display && dispprop !== undefined) {
    //displayProperties = {...displayProperties, ...dispprop};
    displayProperties = _.merge(displayProperties, dispprop);
    updateControls();
    updateDisplay();
  }

  // force
  if ( force && forceprop !== undefined) { 
    //forceProperties = {...forceProperties, ...forceprop};
    forceProperties = _.merge(forceProperties, forceprop);
    updateControls();
    updateForces();

  } else {
    // when only node pos/drop has imported
    // need to issue tick event, and the only way to do is to restart sim, i think
    //simulation.restart();

    // actually updateAll() is what i need, i think
    updateAll();

      
  }
}

function exportNodePositions() {
// https://stackoverflow.com/questions/17781472/how-to-get-a-subset-of-a-javascript-objects-properties 
  var nodepos = graph.nodes.map(function(e, i) {return ['id', 'x','y', 'fx','fy'].reduce(function(a,k) {if (k in e) a[k] = e[k] ; return a} , {})})

  var nodepos = {}
  graph.nodes.forEach(function(e, i) { nodepos[e.id] = 
      ['id', 'x','y', 'fx','fy'].reduce(function(a,k) {if (k in e) a[k] = e[k] ; return a} , {})
  })

  nodepos['dropped_nodes'] = graph.graph.dropped_nodes.map(function(x) { return x.id });


  if (true) {

    //fh = getNewFileHandle();
    //writeFile(fh, nodepos);
    //writeFile( nodepos);
    writeFile( JSON.stringify(nodepos), 'nodepos.json' );
    //writeFile( JSON.stringify(nodepos, function(k,v) { return v.toFixed ? Number(v.toFixed(2)) : v ;} ), 'nodepos.json' );
  }

  if (false) {
    // Need Node.js?
    // https://stackoverflow.com/questions/45148833/write-json-object-to-json-file-in-javascript
    const FileSystem = require("fs");
    FileSystem.writeFile('nodepos.json', JSON.stringify(nodepos), (error) => {
      if (error) throw error;
    });
  }

  if (false) {
    // this works, but doesnt let user to choose file name (on Chrome, at least)
    
    // http://www.4codev.com/javascript/download-save-json-content-to-local-file-in-javascript-idpx473668115863369846.html
    function download(content, fileName, contentType) { 
      const a = document.createElement("a"); 
      const file = new Blob([content], { type: contentType }); 
      a.href = URL.createObjectURL(file); 
      a.download = fileName; 
      a.click(); 
    } 
    //download(JSON.stringify(graph), 'graph.json', 'test/plain')
    download(JSON.stringify(nodepos), 'nodepos.json', 'text/plain')
  }



}

async function importNodePositions(fxonly=false) {
  // read the saved node position and use them for "fixed" position
  // all node got fixed when you call this
  console.log('importNodePositions');
  // https://stackoverflow.com/questions/3582671/how-to-open-a-local-disk-file-with-javascript
  let nodepos = await readFile();
  // special entries: dropped_nodes
  let dropped_nodes = nodepos['dropped_nodes'];
  if (dropped_nodes !== undefined) {
    let nd = graph.nodes.filter(function(n) { return dropped_nodes.includes(n.id);}  );
    drop_nodes(nd);
  }

  for (let i = 0, nd, np; i < graph.nodes.length; ++i ) { 
    nd = graph.nodes[i];
    np = nodepos[nd.id];
    if (np === undefined ) {
      // node not in the graph
    } else {
      if (fxonly) {
        if (np.fx !== undefined ) {
             console.log(nd);
//          nd.x = nodepos[nd.id].fx;
//          nd.y = nodepos[nd.id].fy;
          nd.fx = nodepos[nd.id].fx;
          nd.fy = nodepos[nd.id].fy;
        }
      } else {
             console.log('not fxonly')
        nd.x = nodepos[nd.id].x;
        nd.y = nodepos[nd.id].y;
        nd.fx = nodepos[nd.id].x;
        nd.fy = nodepos[nd.id].y;
      }
    }
  }

//  // dont know why, but when i only changed fx, i better do this.
//  if (fxonly) {
//    node
//        .attr("x", function(d) { return d.x; })
//        .attr("y", function(d) { return d.y; })
//        .attr("fx", function(d) { return d.fx; })
//        .attr("fy", function(d) { return d.fy; })
//    ;
//  }
  
  // make behavior of cursor to be more appropriate when a lot got stuck
  if (! fxonly) {
    setVerySticky(true);
  }

  // need to issue tick event, and the only way to do is to restart sim, i think
    simulation.restart();
}

//////////// UI EVENTS ////////////

// node drag
function dragstarted(event, d) {
  if (event.sourceEvent.shiftKey) { // && simulation.alpha() < 0.1) {
    // move canvas, instead of node
    d.canvas_dragging = true;
    canvas.canvas_dragging = true;
//   this.ondrag = null;
//   this.ondragend = null;
    d3.select(this).call(
      d3.drag()
      .on("start", canvasdragstarted)
      .on("drag", canvasdragged)
      .on('end', canvasdragended)
    );
    return;
  }

  if (! event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  if (d.canvas_dragging) {
    console.log('i dont think you reach here...?', this, d);
    return
  }
  d.fx = event.x;
  d.fy = event.y;
}

function dragended(event, d) {
  if (d.canvas_dragging) {
    console.log('i dont think you reach here...?');
    d.canvas_dragging = null;
    return
  }
  //console.log(event);
  if (! event.active) simulation.alphaTarget(0.0001);
  if (event.sourceEvent.ctrlKey) {
    if (forceProperties.verysticky.enabled) {
      // release
      d.fx = null;
      d.fy = null;
    } else {
      // keep it fixed
             ;
    }

  } else {
    if (forceProperties.verysticky.enabled) {
      // keep it fixed
             ;
    } else {
      // release
      d.fx = null;
      d.fy = null;
    }
  }
  if (displayProperties.sticky.visible) { updateDisplay(); }
  d.canvas_dragging = null;
}

// canvas drag
function canvasdragstarted(d) {
//  console.log('canvas start');
}
function canvasdragended(d) {
//  console.log('canvas end');
  node.call(d3.drag().on('start',dragstarted).on('drag', dragged).on('end', dragended));

}
function canvasdragged(event, d) {
//console.log('canvas drag');
  d.x += event.dx;
  d.y += event.dy;
  d3.select(this).attr("transform", "translate(" + d.x + "," + d.y + ")");
}

// plot drag
function plotdragstarted(event, d) {
  console.log('plot start');
}
function plotdragended(event, d) {
  console.log('plot end');

}
function plotdragged(event, d) {
console.log('plot drag');
  d.x += event.dx;
  d.y += event.dy;
  d3.select(this).attr("transform", "translate(" + d.x + "," + d.y + ")");
}

// legend drag
function legenddragged(event, d) {
  d.x += event.dx;
  d.y += event.dy;
  d3.select(this).attr("transform", "translate(" + d.x + "," + d.y + ")");
}

// link click
function linkclicked(event, d) {
  console.log('link click', d);
  updateActiveBarplot(d)

}
function nodeclicked(event, d) {
  console.log('node click', d, event);
  if (event.altKey ) {
    drop_nodes(d);
  } else {

    updateActiveBarplot(d)
  }

}

//////////// SAVE LOAD PROPERTIES ////////////

let loadOptions = {
  nodepos : {
    all_nodes : true, 
    fixed_only : false, 
  },
  dropped_nodes : true, 
  display_props :  true,
  force :  false ,
};

async function writeFile(contents, suggestedName) {
  var options = {
    types: [
      {
        description: 'Text Files',
        accept: {
          'text/plain': ['.json','.txt'],
        },
      },
    ],
  };
  if (suggestedName !== undefined) {
    options['suggestedName'] = suggestedName;
  }
  const fileHandle = await window.showSaveFilePicker(options);
  // https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle
  console.log(fileHandle);
  console.log(contents);
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function readFile() {
  const options = {
    types: [
      {
        description: 'Text Files',
        accept: {
          'text/plain': ['.json','.txt'],
        },
      },
    ],
  };
  [fileHandle] = await window.showOpenFilePicker(options);
    // get file contents
  //console.log(fileHandle);
  const file = await fileHandle.getFile();
  //console.log(file);
  contents = await file.text();
  //console.log(contents);
  contents = JSON.parse(contents);
  //console.log(contents);
  return contents;
}

function updateControls() {
  // mirror forceProperties back to controls
  // TODO automate this....   i am hand mapping values to controls...
  elem = document.getElementById("charge");
  elem.enabled = forceProperties['charge']['enabled'];

  document.getElementById("charge_Enabled").checked = forceProperties['charge']['enabled'];
  document.getElementById("charge_StrengthSliderInput").value = forceProperties['charge']['strength'];
  document.getElementById("charge_StrengthSliderOutput").value = forceProperties['charge']['strength'];
  document.getElementById("charge_distanceMinSliderInput").value = forceProperties['charge']['distanceMin'];
  document.getElementById("charge_distanceMinSliderOutput").value = forceProperties['charge']['distanceMin'];
  document.getElementById("charge_distanceMaxSliderInput").value = forceProperties['charge']['distanceMax'];
  document.getElementById("charge_distanceMaxSliderOutput").value = forceProperties['charge']['distanceMax'];
  document.getElementById("link_Enabled").checked = forceProperties['link']['enabled'];
  document.getElementById("link_DistanceSliderInput").value = forceProperties['link']['distance'];
  document.getElementById("link_DistanceSliderOutput").value = forceProperties['link']['distance'];
  document.getElementById("link_IterationsSliderInput").value = forceProperties['link']['iterations'];
  document.getElementById("link_IterationsSliderOutput").value = forceProperties['link']['iterations'];
  document.getElementById("netprod_Enabled").checked = forceProperties['netprod']['enabled'];
  document.getElementById("netprod_StrengthSliderInput").value = forceProperties['netprod']['strength'];
  document.getElementById("netprod_StrengthSliderOutput").value = forceProperties['netprod']['strength'];
  document.getElementById("grosscons_Enabled").checked = forceProperties['grosscons']['enabled'];
  document.getElementById("grosscons_StrengthSliderInput").value = forceProperties['grosscons']['strength'];
  document.getElementById("grosscons_StrengthSliderOutput").value = forceProperties['grosscons']['strength'];
  document.getElementById("grossprod_Enabled").checked = forceProperties['grossprod']['enabled'];
  document.getElementById("grossprod_StrengthSliderInput").value = forceProperties['grossprod']['strength'];
  document.getElementById("grossprod_StrengthSliderOutput").value = forceProperties['grossprod']['strength'];
  document.getElementById("supplydemand_Enabled").checked = forceProperties['supplydemand']['enabled'];
  document.getElementById("supplydemand_StrengthSliderInput").value = forceProperties['supplydemand']['strength'];
  document.getElementById("supplydemand_StrengthSliderOutput").value = forceProperties['supplydemand']['strength'];

  document.getElementsByClassName('showSticky_Enabled').checked = displayProperties.sticky.visible;

  document.getElementById('forcepanel_Enabled').checked = displayProperties.controls.forcepanel.enabled;
  toggleForcepanel();

  document.getElementById('difference_Enabled').checked = seriesProperties.difference.enabled;
  document.getElementById('difference_HideNoDiff_Enabled').checked = seriesProperties.difference.hidenodiff.enabled;
  document.getElementById('seriesdiffRange_PositionSliderOutput').value = displayProperties.colorscale.range;
  document.getElementById('seriesdiffRange_PositionSliderInput').value = displayProperties.colorscale.range;
  document.getElementById('seriesdiffMax_PositionSliderOutput').value = displayProperties.colorscale.max;
  document.getElementById('seriesdiffMax_PositionSliderInput').value = displayProperties.colorscale.max;

  document.getElementById('title_Enabled').checked = displayProperties.title.enabled;
  toggleTitlecontrols();

  document.getElementById('label_Enabled').checked = displayProperties.label.enabled;
  document.getElementById('label_FilterSliderOutput').value = displayProperties.label.filter_level;
  document.getElementById('label_FilterSliderInput').value = displayProperties.label.filter_level;
  document.getElementById('label_MinSizeSliderOutput').value = displayProperties.label.minimum_label_size;
  document.getElementById('label_MinSizeSliderInput').value = displayProperties.label.minimum_label_size;
  document.getElementById('labelAboveNode_Enabled').value = displayProperties.label.pos_above_node;
  toggleLabelcontrols();

  document.getElementById('barplot_Enabled').checked = displayProperties.controls.barplot.enabled; 
  toggleBarplotcontrols();

  document.getElementById('verySticky_Enabled').checked = forceProperties.verysticky.enabled; 

  document.getElementById('nodeposFixedOnly_Enabled').checked = loadOptions.nodepos.fixed_only; 
  document.getElementById('nodeposAllNodes_Enabled').checked = loadOptions.nodepos.all_nodes; 
  document.getElementById('dropNodes_Enabled').checked = loadOptions.dropped_nodes; 
  document.getElementById('importDisplayProperties_Enabled').checked = loadOptions.display_props; 
  document.getElementById('importForces_Enabled').checked = loadOptions.force; 


}

// convenience function to update everything (run after UI input)
function updateAll() {
    updateForces();
    updateDisplay();
}

/**
 * @param {String} HTML representing a single element
 * @return {Element}
 */
function htmlToElement(html) {
    var template = document.createElement('template');
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}

//////////// BAR PLOTS ////////////

function makeBarplot(plotidx) {

  var n = plotidx + 1;

  var plot = svg.append('g')
      .attr("class", "plot")
      .attr("id", "plotbox" + n)
      .attr("transform", "translate(" + (width - 400) + ", 20)")
     .data([{'x':(width-400), 'y':20}])
     .call(d3.drag() 
        .on("start", plotdragstarted) 
        .on("drag", plotdragged) 
        .on("end", plotdragended))
  ;

  displayProperties.bar.plots.push(plot);
  if ( ! document.getElementById(`barplot_${n + 1}_ActiveInput`) ) {
    var x = document.getElementById(`barplot_${n}_ActiveInput`);
    console.log(x);
    //var y = d3.select(`#barplot_${n}_ActiveInput`);
    var s = `<p><input id="barplot_${n+1}_ActiveInput" type="radio" name="select_barchart" value="plot${n+1}" onchange="setActiveBarplot(${n});"        >plot${n+1}</p>`;
    var newinp = htmlToElement(s);

    var z = x.parentElement.parentElement.insertBefore(newinp, x.parentElement.nextSibling);


  }
}

function showHideBarplot() {
  // hide all barplot
  if (displayProperties.bar.visible) {
    d3.selectAll('.plot').style('opacity', 1);
  } else {
    d3.selectAll('.plot').style('opacity', 0);
  }
}

function clearBarplot() {
  var plotidx = displayProperties.bar.active;
  if (plotidx > (displayProperties.bar.plots.length - 1)) { return; }

  var plot = displayProperties.bar.plots[plotidx]
  var radio = document.getElementById(`barplot_${plotidx + 1}_ActiveInput`);
  plot.selectAll('*').remove();
  plot.attr('dataid', null);
  radio.nextSibling.textContent = `plot${plotidx + 1}`;
}

function setActiveBarplot(idx) {
  displayProperties.bar.active = idx;
  var n = idx + 1;
  var radio = document.getElementById(`barplot_${n}_ActiveInput`);
  console.log(radio); 
  radio.checked = true;
}

function updateAllBarplot() {
    // event triggered without specifying particular plot
    // action applies to all plots
    for (var i=0, plot; i < displayProperties.bar.plots.length; ++i) {
      plot = displayProperties.bar.plots[i];
      if (! Object.hasOwnProperty(plot, 'dataid')) { continue; }
      dataid = plot.attr('dataid');
      if ( ! dataid ) {
        continue;
      }
      if (dataid.includes(':')) {
        d = graph.links.filter(function(x) {return x.id == dataid})[0] ;
      } else {
        d = graph.nodes.filter(function(x) {return x.id == dataid})[0] ;
      }
      updateBarplot(d, i);
    }
}

function updateActiveBarplot(d) {

  var plotidx = displayProperties.bar.active;
  updateBarplot(d, plotidx);
}

function barplotClicked(event, d) {
  if (event.altKey) {
    clearBarplot()
  } else {
    hilight_edges('none'); 
    hilight_bar(); 
    let parentid = event.currentTarget.parentNode.id
    if (parentid.startsWith('plotbox')) {
      let plotidx = parseInt(parentid.slice(7)) - 1;
      setActiveBarplot(plotidx);
    }
  }
}

function updateBarplot(d, plotidx) {

  if (!displayProperties.bar.visible) { return; }

  //console.log(d);
  if (plotidx === undefined) {
    plotidx = displayProperties.bar.active;
  }

  if (plotidx > displayProperties.bar.plots.length - 1) {
    makeBarplot(plotidx);
    if (d === undefined) { return; }
  }

  var plot = displayProperties.bar.plots[plotidx]
  var radio = document.getElementById(`barplot_${plotidx + 1}_ActiveInput`);
  plot.attr('dataid', d.id);

  //console.log(plot);
  plot.selectAll('*').remove();

  var boxwidth = 400, boxheight=300;

  var margin = {top: 10, right: 10, bottom: 10, left:90};

  var
    mywidth = boxwidth - margin.left - margin.right,
    myheight = boxheight - margin.top - margin.bottom;

  var data = Object.entries(get_flux_by_process(d))
    .map( function(d) { return {'process': d[0], 'flux': d[1]} } );
  var data2 = Object.entries(get_flux_by_process_atdiffpos(d))
    .map( function(d) { return {'process': d[0], 'flux': d[1]} } );
  data.forEach( function(elem, idx) { 
    elem['diff'] = elem['flux'] - data2[idx]['flux'];
    elem['flux0'] = data2[idx]['flux'];
    elem['desc'] = procdesc[elem['process']];
  } )
  // special treatment...
  data.forEach( function (elem, idx) {
    if ( elem['flux'] != 0 && elem['flux0'] == 0) {
      elem['flux0'] = .01 * Math.sign(elem['flux']);
    }
  });

  var amax = function(dat, name) {
    return Math.max.apply(null, dat.map(function(d) {return d[name]}) )
  }
  var amin= function(dat, name) {
    return Math.min.apply(null, dat.map(function(d) {return d[name]}) )
  }


  plot
    .append('rect')
    .attr('class', 'plot_bg')
    .attr('width', boxwidth)
    .attr('height', boxheight)
    .attr('opacity', 0)
//    .on('click', function(d) {hilight_edges('none'); hilight_bar(); setActiveBarplot(plotidx);})
    .on('click', barplotClicked)
    .on('dblclick', clearBarplot)
  ;
  
     


  var x = d3.scaleLinear()
    //.domain([Math.min(0, amin(data, 'flux')), amax(data, 'flux')]).nice()
    .domain([Math.min(0, amin(data, 'flux')), Math.max(0, amax(data, 'flux'))]).nice()
    .range([0, mywidth])
  ;
  plot.append('g')
    .attr("transform", "translate(0," + myheight + ")")
    .call(d3.axisBottom(x).ticks(5));

  var y = d3.scaleBand()
    .domain(data.map(function(d) {return  d['process']}).sort(function(a,b) {return a.substring(1) - b.substring(1)}))
    .range([0, myheight])
    .padding(.1);
  plot.append('g')
    .call(d3.axisLeft(y));

  if (false) {

    var title = plot.append('g')
      .append('text');
    title.attr({'x': mywidth * 5, 'y': 0} );
    //title.text(d['id']);
    var label_to_use;
    if (displayProperties.label.use_cryptic_name) {
      label_to_use = 'id';
    } else {
      label_to_use = 'desc';
    }

    var mytitle;
    if ('source' in d ) {
      mytitle = d.source[label_to_use] + ' \u21d2 ' + d.target[label_to_use];
    } else {
      mytitle = d[label_to_use];
    }
    title.text(mytitle);
    radio.nextSibling.textContent = mytitle;
  }



  // tried many combinations but, i thought
  // filled part represents current value
  // frame represents reference value, with color code shwoing magnitude of changes...
  //
  var myRect = plot.append('g')
    //.attr('class', 'bar')
    .selectAll('rect')
    .data(data)
    .enter().append('rect')
    .attr('class', function(d) {return `bar ${d['process']}`})
    .attr('x', function(d) { return d.flux < 0 ? x(d.flux) : x(0)} )
    .attr('y', function(d) { return y( d['process'] ) })
    .attr('width', function(d) { return d.flux < 0 ? x(0) - x(d.flux) : x(d.flux)-x(0)  } )
    .attr('height', y.bandwidth())
    //.attr('fill', function(d) { return seriesProperties.difference.enabled ? edgecolorScale(d.diff) : '#aaa'})
    //.attr('fill', function(d) { return seriesProperties.difference.enabled ? 'none' : '#aaa'})
    //.attr('stroke', function(d) { return seriesProperties.difference.enabled ? 'black' : 'none'})
    //.attr('fill', function(d) { return seriesProperties.difference.enabled ? 'none' : '#aaa'})
    //.attr('stroke', function(d) { return seriesProperties.difference.enabled ? 'black' : 'none'})
    //.attr('fill', 'none')
    ////.attr('stroke', 'black')
    //.attr('stroke', function(d) { return seriesProperties.difference.enabled ? edgecolorScale(d.diff) : '#aaa'})
    .attr('fill', '#bbb')
    .attr('stroke', 'none')
    .on('click', function(event, d) {hilight_edges(d['process']); hilight_bar(this); event.stopPropagation()})
  ;
  //
  // tooltip
  myRect.append('title')
      .text( function(d) {return d.desc; });

  if (seriesProperties.difference.enabled) {
    var myRect_bg = plot.append('g')
      .selectAll('rect')
      .data(data)
      .enter().append('rect')
      .attr('class', function(d) {return `bar ${d['process']} shadow`})
      .attr('x', function(d) { return d.flux0 < 0 ? x(d.flux0) : x(0)} )
      .attr('y', function(d) { return y( d['process'] ) })
      .attr('width', function(d) { return d.flux0 < 0 ? x(0) - x(d.flux0) : x(d.flux0)-x(0)  } )
      .attr('height', y.bandwidth())
      //.attr('fill', edgecolorScale(d.diff))
    //  .attr('fill', '#eee')
    //  .attr('stroke', 'none')
      .attr('fill', '#ffffff01')
    //  .attr('stroke', '#ccc')
    .attr('stroke', function(d) { return seriesProperties.difference.enabled ? edgecolorScale(d.diff) : '#aaa'})
    .on('click', function(event, d) {hilight_edges(d['process']); hilight_bar(this); event.stopPropagation()})
    ;
    // tooltip
    myRect_bg.append('title')
        .text( function(d) {return d.desc; });
  }




}

function hilight_bar(bar) {
  // TODO go back to the red/blue scale if needed...

  //plot.selectAll('.bar').attr('fill', '#aaa');

  //d3.selectAll('.bar').attr('fill', '#aaa');
  //d3.selectAll('.bar').attr('fill', function(d) { return seriesProperties.difference.enabled ? edgecolorScale(d.diff) : '#aaa'});
  d3.selectAll('.bar').attr('fill', '#bbb').attr('stroke', 'none');
  d3.selectAll('.bar.shadow').attr('fill', '#ffffff01').attr('stroke', function(d) { return seriesProperties.difference.enabled ? edgecolorScale(d.diff) : '#aaa'});

  if (bar === undefined) { return; }
  //d3.select(bar).attr('fill', hl_color);
  var tohilite = d3.selectAll('.bar.' + bar.classList[1]);
    if (tohilite) {tohilite.attr('fill', hl_color)}
}

function hilight_edges(process) {
  console.log('hilight', process);

  hl_link.selectAll('line')
    .attr("opacity", 0)
    .attr("stroke-width", 0)
  ;

  var mylinks = graph.links.filter(function(d) {return process in get_flux_by_process(d)});
  //mylinks.map(function(d)
  var mylinkids = mylinks.map( function (x) {return x.id });
//  graph.links
//    .forEach(function (d) { d.opacity =  mylinkids.includes(d.id) ? 1 :  0;})
//  ;
//  graph.links
//    .forEach(function (d) { d.hilight_width = mylinkids.includes(d.id) ? edgewidthScale(get_process_flux(d, process)) :  0;})
//  ;
  for (var i=0, link, flux; i < graph.links.length; ++i) {
    link = graph.links[i]; 
    if (mylinkids.includes(link.id)) {
      link.opacity = 1;
      link.hilight_width = edgewidthScale(get_process_flux(link, process));
    } else {
      link.opacity = 0;
      link.hilight_width = 0;
    }
  }
  hl_link
    .attr('opacity', function(d) { return d.opacity })
    .attr('stroke-width', function(d) { return d.hilight_width })
  ;
}

function drop_nodes(mynodes) {
  // http://bl.ocks.org/tgk/6068367

  if (mynodes.constructor !== Array) {
    drop_nodes([ mynodes ]);
    return ;
  }

  if (mynodes.length < 1) { return;}

  
  console.log('drop_nodes', mynodes);
  for (mynode of mynodes) {
    //graph.nodes.findIndex(mynode)
//    console.log(graph.nodes.length, graph.links.length);

    // drop node
    graph.graph.dropped_nodes.push(
      ...graph.nodes.splice(graph.nodes.indexOf(mynode), 1));

    // update edgelist of the other side of node

  //  console.log( graph.links.filter( function(l) { return l.source === mynode; }) );
    graph.links.filter( function(l) { return l.source === mynode; })
      .forEach(function(l) { l.target.edge_list.splice( l.target.edge_list.indexOf(mynode.id + ':' + l.target.id), 1) });
  //  console.log( graph.links.filter( function(l) { return l.source === mynode; }) );

  //  console.log( graph.links.filter( function(l) { return l.target === mynode; }) );
    graph.links.filter( function(l) { return l.target === mynode; })
      .forEach(function(l) { l.source.edge_list.splice( l.source.edge_list.indexOf(l.source.id + ':' + mynode.id), 1) });
  //  console.log( graph.links.filter( function(l) { return l.target === mynode; }) );

    // drop links
    graph.graph.dropped_links = graph.links.filter( function(l) { return (l.source === mynode) || (l.target === mynode); });
    graph.links = graph.links.filter( function(l) { return (l.source !== mynode) && (l.target !== mynode); });

//    console.log(graph.nodes.length, graph.links.length);
  }

  // redraw all the nodes/links/etc
  initializeDisplay();

  // heat up a bit
  if (event !== undefined && ! event.active) simulation.alpha(0.1);
}

function restore_node(node) {
}

function exportImage(png=true, scale=1) {
  // alert('TODO\n Use this library! https://github.com/sharonchoong/svg-exportJS\n and this too https://github.com/canvg/canvg');




  // this works, but
  if ( png ) { 
    saveSvgAsPng(svg.node(), 'filename.png', { backgroundColor: '#fff', scale: scale });

    // this isn't working, got tiny, black image, somehow data does not translates to output file...
   //writePNG();
  } else {

    //  also, 
    saveSvg(svg.node(), 'filename.svg', { backgroundColor: '#fff', scale: scale });
  }

}

async function writePNG() { 

  const xmlString = new XMLSerializer().serializeToString(svg.node());
  const mycanvas = document.createElement('canvas');
  const img = new Image();
  const w = svg.width;
  const h = svg.height;

//  mycanvas.width = w;
//  mycanvas.height = h;
  const context = mycanvas.getContext('2d');



//  img.onload = function() {
////    context.drawImage(img, 0, 0);
//   context.drawImage(img, 0, 0, w, h);
//  };
   context.drawImage(img, 0, 0, w, h);
  img.src = "data:image/svg+xml;utf8," + xmlString;

  //const pngData = mycanvas.toDataURL('image/png');
  mycanvas.toBlob(function(blob) {writePNG2(blob, 'file.png')});

}

async function writePNG2(blob, suggestedName) {


  console.log(blob);
  // Write the PNG data to the file
  const options = {
    types: [
      {
        description: 'PNG Files',
        accept: {
          'image/png': ['.png'],
        },
      },
    ],
  };
  if (suggestedName !== null) {  options['suggestedName']= suggestedName }
  const fileHandle = await window.showSaveFilePicker(options);
  console.log(fileHandle);
  const writable = await fileHandle.createWritable();
  console.log(writable);
  await writable.write(blob);
  await writable.close();
}

<!-- vim: set et sw=2:  -->
