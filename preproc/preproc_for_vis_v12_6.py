#!/usr/bin/env python
# coding: utf-8


import networkx as nx
import pandas as pd
import numpy as np

import json

import reader_json_v1 as reader
from importlib import reload
reload(reader)

OneCase = reader.OneCase
#prep_inp = reader.prep_inp

myver='12_6'

        

def mk_graph(df_edges, node_attrs = None, edge_attrs = None):
    """generate NX graph from edge list """

    g = nx.from_pandas_edgelist(df_edges.reset_index(), 
            source='material0', 
            target='material1', 
            edge_attr=True,
            create_using=nx.DiGraph)
    if node_attrs is not None:
        for dct in node_attrs:
            nx.set_node_attributes(g, dct)
    if edge_attrs is not None:
        for dct in edge_attrs:
            nx.set_edge_attributes(g, dct)

    return g


def export_graph(g, fname='d3/chemnetwork.json' ):
    """save NX graph to json file"""
    js = nx.node_link_data(g)
    json_dump = json.dumps(js, indent=2)
    with open(fname, 'w') as f:
        f.write(json_dump)

def update_meta(g, inpdat):
    """atach metadata for materials/processes"""
    dct = {}
    if 'df_material_defs' in inpdat:
        dct.update(inpdat['df_material_defs'].to_dict(orient='records'))
    if 'df_process_defs' in inpdat:
        dct.update(inpdat['df_process_defs'].to_dict(orient='records'))
    g.graph.update(dct)

    #g.graph.update({
    #    #'scale': scale, 
    #    'material_desc': inpdat['df_material_defs'].to_dict(orient='records'),
    #    'process_desc': inpdat['df_process_defs'].to_dict(orient='records'),
    #    })


def process_single(dat, inpdat, title=None):
    """process single gdx file to networx graph for vis

    input
    dat: OneCase object
    inpdat:  dict from prep_inp()
    title:  title to name the cae

    output
    2-tuple of 
    g: networkx digraph
    dfs:  dict of relevane dataframe/dicts, for QA purpose
    """

    #global df_supply
    #global df_demand
    #global df_flux_byproc

    # read dataframes from model ouput gdx files
    df_flux = dat.df_flux
    df_edges = dat.df_edges
    #df_net_prod = dat.df_net_prod
    df_gross_prod = dat.df_gross_prod
    df_gross_cons = dat.df_gross_cons

    # read dataframes from model input gdx files
    df_pgrp = inpdat['df_pgrp']
    df_demand = inpdat['df_demand']
    df_supply = inpdat['df_supply']
    df_unconstrained_raw = inpdat['df_unconstrained_raw']
    df_material_defs = inpdat['df_material_defs']
    df_process_defs = inpdat['df_process_defs']

    # deals tith product group's demand
    if dat.condense_pgrp:
        # method 2, pgrp condensed already.  so simply append the pgrp demand to demands
        df_demand2 = pd.concat([df_demand, 
            (df_pgrp.loc[:,'pgrp_demand']
                .reset_index()
                .set_axis(['material', 'demand'], axis='columns', copy=True)
                .set_index('material')
                )])
    else:
        # method 1, split demand across members
        lst = []
        for r_grp in df_pgrp.itertuples():
            members = df_flux[df_flux.index.isin(r_grp.members)]
            #print(r_grp)
            assert len(members.index) > 0
            totflux = members.flux.sum()
            for r_mem in members.itertuples():
                lst.append({'material': r_mem.Index, 'demand': r_mem.flux / totflux * r_grp.pgrp_demand})
        df_demand2 = pd.concat([df_demand, pd.DataFrame(lst).set_index('material')])


    dct_flux_byproc = {}
    for mat, df in dat.df_flux_byproc.groupby('material'):
        dct_flux_byproc[mat] = {'flux_byproc': df.droplevel(0).to_dict()['flux']}

    dct_edges_byproc = {}
    for tup, df in dat.df_edges_byproc.groupby(['material0','material1']):
        dct_edges_byproc[tup] = {'flux_byproc': df.droplevel((0,1)).to_dict()['flux']}

    
    g = mk_graph(df_edges, node_attrs=[
        df_flux.to_dict(orient='index'), 
        #df_net_prod.to_dict(orient='index'), 
        df_gross_prod.to_dict(orient='index'), 
        df_gross_cons.to_dict(orient='index'), 
        df_supply.to_dict(orient='index'), 
        df_demand2.to_dict(orient='index'), 
        df_unconstrained_raw.to_dict(orient='index'),
        dct_flux_byproc,
        ], edge_attrs=[
            dct_edges_byproc,
            ])

    # meta data
    if title is not None:
        g.graph.update({'title': title})
    g.graph.update({
        })
    update_meta(g, inpdat)

    # aux dataframes (and dicts)
    dfs = {
            'df_flux': df_flux,
            #'df_net_prod': df_net_prod,
            'df_gross_prod': df_gross_prod,
            'df_gross_cons': df_gross_cons,
            'df_supply': df_supply,
            'df_demand': df_demand2,
            'dct_edges_byproc': dct_edges_byproc,
            'df_process_defs': df_process_defs,
            'df_material_defs': df_material_defs,

            }
    return g, dfs

#def process_series(dats, inpdat, title=None, series_descs = None, orient_edges=False):
def process_series(dats,         title=None, series_descs = None, orient_edges=False):
    """process series of  gdx files to networx graph for vis

    input
    dat: dict of {id: OneCase objects}
    inpdat:  dict from prep_inp()
    title:  title to name the cae
    series_descs: list of description for each cases (each of dats).  used for part of title when drawn

    output
    2-tuple of 
    g: networkx digraph (many node/edge attrubutes are list spanning across dats)
    dfs:  dict of relevane dataframe/dicts, for QA purpose
    """
    #global df_supply
    #global df_demand

    def minmax(v):
        mx = v.max()
        mn = v.min()
        if abs(mx) > abs(mn):
            return mx
        else:
            return mn

    if orient_edges:
        # get all the edges across series of cases, pick single orientation for each
        edgelist = []
        for dat in dats.values():
            dat.condense_dual_edges()
            lst = dat.df_edges.index.to_list()
            for edge in lst:
                if edge in edgelist:
                    pass
                elif (edge[1], edge[0]) in edgelist:
                    pass
                else:
                    edgelist.append(edge)
        for dat in dats.values():
            dat.specify_edge_orientation(edgelist)



    # read dataframes from model ouput gdx files

    df_edges = pd.concat([dat.df_edges.reset_index() for dat in dats.values()]).groupby(['material0', 'material1']).agg(max)

    df_flux = pd.concat([dat.df_flux.reset_index() for dat in dats.values()]).groupby(['material']).agg(max)
    #df_net_prod = pd.concat([dat.df_net_prod.reset_index() for dat in dats.values()]).groupby('material').agg(minmax)
    df_gross_prod = pd.concat([dat.df_gross_prod.reset_index() for dat in dats.values()]).groupby('material').agg(minmax)
    df_gross_cons = pd.concat([dat.df_gross_cons.reset_index() for dat in dats.values()]).groupby('material').agg(minmax)

    # read dataframes from model input gdx files
    # just use the values from first dat
    frst = dats[next(iter(dats.keys()))]
    df_pgrp = frst.df_pgrp
    df_demand = frst.df_demand
    df_supply = frst.df_supply
    df_unconstrained_raw = frst.df_unconstrained_raw
    inpdat = {
            'demend': df_demand,
            'supply': df_supply,
            'unconstrained_raw': df_unconstrained_raw,
            }
    #df_material_defs = inpdat['df_material_defs']
    #df_process_defs = inpdat['df_process_defs']

    # deals with product group's demand
    if any(_.condense_pgrp for _ in dats.values()):
        # method 2, pgrp condensed already.  so simply append the pgrp demand to demands
        assert all([_.condense_pgrp for _ in  dats.values()])
        df_demand2 = pd.concat([df_demand, 
            (df_pgrp.loc[:,'pgrp_demand']
                .reset_index()
                .set_axis(['material', 'demand'], axis='columns', copy=True)
                .set_index('material')
                )])
    else:
        # method 1, split demand across members
        lst = []
        if df_pgrp:
            for r_grp in df_pgrp.itertuples():
                print(r_grp)
                members = df_flux[df_flux.index.isin(r_grp.members)]
                assert len(members.index) > 0
                totflux = members.flux.sum()
                for r_mem in members.itertuples():
                    lst.append({'material': r_mem.Index, 'demand': r_mem.flux / totflux * r_grp.pgrp_demand})
        if lst:
            df_demand2 = pd.concat([df_demand, pd.DataFrame(lst).set_index('material')])
        else:
            df_demand2 = df_demand


    #dct_x = {k:dat.df_x for k,dat in dats.items()}
    #df_series_x = (pd.concat(dct_x.values(), axis=1)
    #        .fillna(0)
    #        .set_axis(dct_x.keys(), axis=1, copy=False))

    #dct_xm = {k:dat.df_xm for k,dat in dats.items()}
    #df_series_xm = (pd.concat(dct_xm.values(), axis=1)
    #        .fillna(np.nan)
    #        .set_axis(dct_xm.keys(), axis=1, copy=False))


    # add series of flux to node, flux to edges
    dct_flux = {k:dat.df_flux for k,dat in dats.items()}
    df_series_flux = (pd.concat(dct_flux.values(), axis=1)
            .fillna(0)
            .set_axis(dct_flux.keys(), axis=1, copy=False))

    dct_flux_byproc = {k:dat.df_flux_byproc for k,dat in dats.items()}
    df_series_flux_byproc = (pd.concat(dct_flux_byproc.values(), axis=1)
            .fillna(0)
            .set_axis(dct_flux_byproc.keys(), axis=1, copy=False))
    dct_edges = {k:dat.df_edges for k,dat in dats.items()}
    df_series_edges = (pd.concat(dct_edges.values(), axis=1)
            .fillna(0)
            .set_axis(dct_edges.keys(), axis=1, copy=False))

    dct_edges_byproc = {k:dat.df_edges_byproc for k,dat in dats.items()}
    df_series_edges_byproc = (pd.concat(dct_edges_byproc.values(), axis=1)
            .fillna(0)
            .set_axis(dct_edges_byproc.keys(), axis=1, copy=False))


    dct_series_flux = { k: {'series_flux': list(v.values())} for k,v in df_series_flux.to_dict(orient='index').items()}
    dct_series_edges = { k: {'series_flux': list(v.values())} for k,v in df_series_edges.to_dict(orient='index').items()}

    dct_series_flux_byproc = {}
    for tup, df in df_series_flux_byproc.groupby('material'):
        dct_series_flux_byproc[tup] = {'series_flux_byproc': df.droplevel(0).T.to_dict(orient='records')}
    
    dct_series_edges_byproc = {}
    for tup, df in df_series_edges_byproc.groupby(['material0','material1']):
        dct_series_edges_byproc[tup] = {'series_flux_byproc':df.droplevel((0,1)).T.to_dict(orient='records')}


    g = mk_graph(df_edges, node_attrs=[
        #df_flux.to_dict(orient='index'),
        #df_net_prod.to_dict(orient='index'),
        #df_gross_prod.to_dict(orient='index'),
        #df_gross_cons.to_dict(orient='index'),
        df_supply.to_dict(orient='index'), 
        df_demand2.to_dict(orient='index'), 
        df_unconstrained_raw.to_dict(orient='index'),
        dct_series_flux, 
        dct_series_flux_byproc,
        ], edge_attrs=[ 
            dct_series_edges,
            dct_series_edges_byproc,
            ])

    # meta data
    if title is not None:
        g.graph.update({'title': title})
    g.graph.update({
        'series_labels' : list(dats.keys()), 
        })
    if series_descs is not None:
        g.graph.update({'series_descs': series_descs})
    if orient_edges:
        g.graph.update({'oriented': True})
    else:
        g.graph.update({'oriented': False})
    update_meta(g, inpdat)

    # aux dataframes (and dicts)
    dfs = {
            'df_flux': df_flux,
            #'df_net_prod': df_net_prod,
            'df_gross_prod': df_gross_prod,
            'df_gross_cons': df_gross_cons,
            'df_supply': df_supply,
            #'df_demand': df_demand2,
            'df_demand': df_demand,
            'df_series_flux': df_series_flux,
            'df_series_edges': df_series_edges,
            'dct_edges': dct_edges,
            'dct_edges_byproc': dct_edges_byproc,
            'df_series_edges_byproc': df_series_edges_byproc,
            'dct_series_edges': dct_series_edges,
            'dct_series_edges_byproc': dct_series_edges_byproc,
            #'df_process_defs': df_process_defs,
            #'df_material_defs': df_material_defs,
            'dct_series_flux': dct_series_flux,
            'df_series_flux_byproc': df_series_flux_byproc,
            'dct_series_flux_byproc': dct_series_flux_byproc,

            #'df_series_x': df_series_x,
            #'df_series_xm': df_series_xm,
            }

    return g, dfs


if __name__ == '__main__':

    #import glob
    from pathlib import Path
    import re

    #condense_defs = {
    #        'PROPYLENE': [
    #            'PROPYLENE_REFINERYGRADE',
    #            'PROPYLENE_POLYMERGRADE',
    #            'PROPYLENE_CHEMGRADE',
    #            ],
    #        }


    ddir = Path.cwd() / r'../data'

    odir = ddir
    if not odir == ddir and odir.is_dir(): odir.mkdir()

    # cases to be processed
    cases = [
            {
                'id': '0c',
                'level_desc': '0 cent',
                'path': '../data/results_cthru_summer2022_v8_e_0.json',
                },
            {
                'id': '50c',
                'level_desc': '50 cent',
                'path':  '../data/results_cthru_summer2022_v8_e_50.json',
                },
            {
                'id': '200c',
                'level_desc': '200 cent',
                'path':  '../data/results_cthru_summer2022_v8_e_200.json',
                },
            ]


    oname = odir / f'chemnetwork_v8_20220909_prepv{myver}.json'   # output json file

    mytitle = 'zhichao demo'

    # assume first of the series has the model input, i.e. stuff like io-matrix
    #inpdat = prep_inp( cases[0]['path'] )


    # read data from each files,  key = 'XX c', value = the data
    print('read data')
    dats = {_['id']: OneCase(_['path'], unitconv=1/2200/1000, 
        ignored_materials=[ 'CoolingWater', 'Electricity', 'Fuel', 'InertGas', 'NaturalGasFuel', 'ProcessWater', 'Steam', ]) for _ in cases}

    # generate graph
    print('make graph')
    print(dats[list(dats.keys())[0]].df_iom)
    g, dfs = process_series(dats, #inpdat,
            title = mytitle,
            series_descs = [_['level_desc'] for _ in cases],
            )




    # save
    print('save')
    export_graph(g, oname)

